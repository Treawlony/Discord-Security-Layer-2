import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  Client,
  EmbedBuilder,
  GuildMember,
  MessageFlags,
} from "discord.js";
import { AuditLog } from "@prisma/client";
import { db } from "../../lib/database";
import { getOrCreateGuildConfig } from "../../lib/guildConfig";
import { isWatchtowerAdmin } from "../../lib/permissions";
import { eventTypeEmoji } from "../../lib/audit";

// Discord embed total character budget (conservative — actual limit is 6000
// across all fields; we stay well under to leave room for title/footer).
const EMBED_CHAR_BUDGET = 5500;

const DEFAULT_LIMIT = 10;

export const data = new SlashCommandBuilder()
  .setName("watchtower-audit")
  .setDescription("Query the PIM audit log.")
  .addSubcommand((sub) =>
    sub
      .setName("user")
      .setDescription("Show audit log entries for a specific user.")
      .addUserOption((opt) =>
        opt.setName("user").setDescription("Target user").setRequired(true)
      )
      .addIntegerOption((opt) =>
        opt
          .setName("limit")
          .setDescription("Number of entries to show (1–25, default 10)")
          .setMinValue(1)
          .setMaxValue(25)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName("recent")
      .setDescription("Show the most recent audit log entries for this server.")
      .addIntegerOption((opt) =>
        opt
          .setName("limit")
          .setDescription("Number of entries to show (1–25, default 10)")
          .setMinValue(1)
          .setMaxValue(25)
      )
  );

// ---------------------------------------------------------------------------
// Embed builder with character-budget truncation
// ---------------------------------------------------------------------------
function buildAuditEmbed(title: string, logs: AuditLog[]): EmbedBuilder {
  const embed = new EmbedBuilder().setTitle(title).setColor(0x5865f2).setTimestamp();

  // Seed charCount with the title length so the budget accounts for it.
  let charCount = title.length;
  let shown = 0;

  for (const log of logs) {
    const emoji = eventTypeEmoji(log.eventType);
    const fieldName = `${emoji} ${log.eventType}`;
    const rolePart = log.roleName ? ` | Role: **${log.roleName}**` : "";
    const fieldValue = `<@${log.discordUserId}> | <t:${Math.floor(
      log.createdAt.getTime() / 1000
    )}:R>${rolePart}`;

    if (charCount + fieldName.length + fieldValue.length > EMBED_CHAR_BUDGET) {
      break;
    }

    embed.addFields({ name: fieldName, value: fieldValue, inline: false });
    charCount += fieldName.length + fieldValue.length;
    shown++;
  }

  if (shown < logs.length) {
    embed.setFooter({
      text: `Showing ${shown} of ${logs.length} entries (truncated to fit Discord limits)`,
    });
  }

  return embed;
}

// ---------------------------------------------------------------------------
// Command handler
// ---------------------------------------------------------------------------
export async function execute(
  interaction: ChatInputCommandInteraction,
  _client: Client
): Promise<void> {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const guildId = interaction.guildId!;
  const config = await getOrCreateGuildConfig(guildId);
  const member = interaction.member as GuildMember;

  if (!isWatchtowerAdmin(member, config)) {
    await interaction.editReply(
      "You do not have permission to use this command.\n\nA Watchtower Admin role is required. Contact your server owner to be assigned the correct role."
    );
    return;
  }

  const subcommand = interaction.options.getSubcommand(true);

  if (subcommand === "user") {
    const target = interaction.options.getUser("user", true);
    const limit = interaction.options.getInteger("limit") ?? DEFAULT_LIMIT;

    const logs = await db.auditLog.findMany({
      where: { guildId, discordUserId: target.id },
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    if (logs.length === 0) {
      await interaction.editReply("No audit log entries found for this query.");
      return;
    }

    const embed = buildAuditEmbed(
      `Audit Log — ${target.username} (last ${limit})`,
      logs
    );
    await interaction.editReply({ embeds: [embed] });
    return;
  }

  if (subcommand === "recent") {
    const limit = interaction.options.getInteger("limit") ?? DEFAULT_LIMIT;

    const logs = await db.auditLog.findMany({
      where: { guildId },
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    if (logs.length === 0) {
      await interaction.editReply("No audit log entries found for this query.");
      return;
    }

    const embed = buildAuditEmbed(`Audit Log — Recent (last ${limit})`, logs);
    await interaction.editReply({ embeds: [embed] });
    return;
  }

  // Unreachable in practice — Discord validates subcommand names
  await interaction.editReply("Unknown subcommand.");
}
