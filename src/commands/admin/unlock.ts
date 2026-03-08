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
  .setName("watchtower-unlock")
  .setDescription("Unlock or unblock a PIM account.")
  .addUserOption((opt) =>
    opt.setName("user").setDescription("The user to unlock").setRequired(true)
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

  // Allow unlock if either lockedAt or blockedAt is set
  if (!pimUser.lockedAt && !pimUser.blockedAt) {
    return interaction.editReply(`<@${target.id}>'s account is not locked or blocked.`);
  }

  const wasBlocked = pimUser.blockedAt !== null;

  await db.pimUser.update({
    where: { id: pimUser.id },
    data: { lockedAt: null, failedAttempts: 0, blockedAt: null },
  });

  await writeAuditLog(client, {
    guildId,
    discordUserId: target.id,
    pimUserId: pimUser.id,
    eventType: "ACCOUNT_UNLOCKED",
    metadata: {
      unlockedBy: interaction.user.id,
      isWatchtowerAdmin: true,
      clearedBlock: wasBlocked,
    },
  });

  const blockNote = wasBlocked ? " Their block has also been cleared." : "";
  return interaction.editReply(
    `<@${target.id}>'s PIM account has been unlocked.${blockNote}`
  );
}
