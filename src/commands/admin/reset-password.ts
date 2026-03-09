import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  Client,
  GuildMember,
  MessageFlags,
} from "discord.js";
import { db } from "../../lib/database";
import { writeAuditLog } from "../../lib/audit";
import { getOrCreateGuildConfig } from "../../lib/guildConfig";
import { isWatchtowerAdmin } from "../../lib/permissions";

export const data = new SlashCommandBuilder()
  .setName("watchtower-reset-password")
  .setDescription("Clear a user's PIM password, forcing them to run /set-password again.")
  .addUserOption((opt) =>
    opt.setName("user").setDescription("The user whose password to reset").setRequired(true)
  );

export async function execute(interaction: ChatInputCommandInteraction, client: Client) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const guildId = interaction.guildId!;
  const config = await getOrCreateGuildConfig(guildId);
  const member = interaction.member as GuildMember;

  if (!isWatchtowerAdmin(member, config)) {
    return interaction.editReply(
      "You do not have permission to use this command.\n\nA Watchtower Admin role is required. Contact your server owner to be assigned the correct role."
    );
  }

  const target = interaction.options.getUser("user", true);

  const pimUser = await db.pimUser.findUnique({
    where: { discordUserId_guildId: { discordUserId: target.id, guildId } },
  });

  if (!pimUser) {
    return interaction.editReply(`<@${target.id}> does not have a PIM account.`);
  }

  await db.pimUser.update({
    where: { id: pimUser.id },
    data: { passwordHash: null, lockedAt: null, blockedAt: null, failedAttempts: 0 },
  });

  await writeAuditLog(client, {
    guildId,
    discordUserId: target.id,
    pimUserId: pimUser.id,
    eventType: "PASSWORD_RESET",
    metadata: { resetBy: interaction.user.id, isWatchtowerAdmin: true },
  });

  return interaction.editReply(
    `<@${target.id}>'s PIM password has been reset. They must run /set-password before they can elevate again.`
  );
}
