import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  Client,
  EmbedBuilder,
  GuildMember,
  MessageFlags,
} from "discord.js";
import { db } from "../../lib/database";
import { getOrCreateGuildConfig } from "../../lib/guildConfig";
import { isWatchtowerAdmin } from "../../lib/permissions";

// Discord embed cap: 25 fields total.
// Reserve 20 for eligible-role assignments and 5 for active elevations.
const MAX_ASSIGNMENT_FIELDS = 20;
const MAX_ELEVATION_FIELDS = 5;

export const data = new SlashCommandBuilder()
  .setName("watchtower-list")
  .setDescription("List all PIM role assignments and active elevations for a user (or all users).")
  .addUserOption((opt) => opt.setName("user").setDescription("Filter by user (leave blank for all)"));

export async function execute(interaction: ChatInputCommandInteraction, _client: Client) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const guildId = interaction.guildId!;
  const config = await getOrCreateGuildConfig(guildId);
  const member = interaction.member as GuildMember;

  if (!isWatchtowerAdmin(member, config)) {
    return interaction.editReply(
      "You do not have permission to use this command.\n\nA Watchtower Admin role is required. Contact your server owner to be assigned the correct role."
    );
  }

  const targetUser = interaction.options.getUser("user");

  // Both queries use the same guild-scoped (optionally user-scoped) filter.
  const baseWhere = targetUser
    ? { guildId, pimUser: { discordUserId: targetUser.id } }
    : { guildId };

  // --- Eligible role assignments ---
  const assignments = await db.eligibleRole.findMany({
    where: baseWhere,
    include: { pimUser: true },
    orderBy: { createdAt: "desc" },
  });

  // --- Active elevations ---
  const activeElevations = await db.activeElevation.findMany({
    where: baseWhere,
    include: { pimUser: true },
    orderBy: { expiresAt: "asc" }, // soonest-to-expire first
  });

  // Empty state: no data in either query
  if (assignments.length === 0 && activeElevations.length === 0) {
    return interaction.editReply("No PIM access records found.");
  }

  const title = targetUser
    ? `PIM Access — ${targetUser.username}`
    : "PIM Access Overview";

  const embed = new EmbedBuilder()
    .setTitle(title)
    .setColor(0x5865f2)
    .setTimestamp();

  // --- Eligible role assignments section ---
  const shownAssignments = assignments.slice(0, MAX_ASSIGNMENT_FIELDS);

  if (shownAssignments.length === 0) {
    embed.addFields({
      name: "Eligible Role Assignments",
      value: "None assigned.",
      inline: false,
    });
  } else {
    for (const a of shownAssignments) {
      embed.addFields({
        name: a.roleName,
        value: `User: <@${a.pimUser.discordUserId}> | Granted by: <@${a.grantedBy}> | <t:${Math.floor(new Date(a.createdAt).getTime() / 1000)}:D>`,
        inline: false,
      });
    }
  }

  // --- Active elevations section ---
  const shownElevations = activeElevations.slice(0, MAX_ELEVATION_FIELDS);

  if (shownElevations.length === 0) {
    embed.addFields({
      name: "Active Elevations",
      value: "None currently active.",
      inline: false,
    });
  } else {
    for (const e of shownElevations) {
      embed.addFields({
        name: `[ACTIVE] ${e.roleName}`,
        value: `<@${e.pimUser.discordUserId}> — expires <t:${Math.floor(e.expiresAt.getTime() / 1000)}:R>`,
        inline: false,
      });
    }
  }

  // --- Footer: note any truncation ---
  const footerParts: string[] = [];
  if (assignments.length > MAX_ASSIGNMENT_FIELDS) {
    footerParts.push(`Showing ${MAX_ASSIGNMENT_FIELDS} of ${assignments.length} assignments`);
  }
  if (activeElevations.length > MAX_ELEVATION_FIELDS) {
    footerParts.push(`${activeElevations.length} active elevations (showing ${MAX_ELEVATION_FIELDS})`);
  }
  if (footerParts.length > 0) {
    embed.setFooter({ text: footerParts.join(" · ") });
  }

  return interaction.editReply({ embeds: [embed] });
}
