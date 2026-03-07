import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  Client,
  PermissionFlagsBits,
} from "discord.js";
import { db } from "../../lib/database";
import { writeAuditLog } from "../../lib/audit";

export const data = new SlashCommandBuilder()
  .setName("watchtower-unlock")
  .setDescription("Unlock a PIM account that was locked due to failed attempts.")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
  .addUserOption((opt) => opt.setName("user").setDescription("The user to unlock").setRequired(true));

export async function execute(interaction: ChatInputCommandInteraction, client: Client) {
  await interaction.deferReply({ ephemeral: true });

  const guildId = interaction.guildId!;
  const target = interaction.options.getUser("user", true);

  const pimUser = await db.pimUser.findUnique({
    where: { discordUserId_guildId: { discordUserId: target.id, guildId } },
  });

  if (!pimUser) {
    return interaction.editReply(`<@${target.id}> does not have a PIM account.`);
  }

  if (!pimUser.lockedAt) {
    return interaction.editReply(`<@${target.id}>'s account is not locked.`);
  }

  await db.pimUser.update({
    where: { id: pimUser.id },
    data: { lockedAt: null, failedAttempts: 0 },
  });

  await writeAuditLog(client, {
    guildId,
    discordUserId: target.id,
    pimUserId: pimUser.id,
    eventType: "ACCOUNT_UNLOCKED",
    metadata: { unlockedBy: interaction.user.id },
  });

  return interaction.editReply(`<@${target.id}>'s PIM account has been unlocked.`);
}
