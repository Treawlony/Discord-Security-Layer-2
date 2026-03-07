import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  Client,
  PermissionFlagsBits,
  EmbedBuilder,
} from "discord.js";
import { db } from "../../lib/database";

export const data = new SlashCommandBuilder()
  .setName("watchtower-list")
  .setDescription("List all PIM eligible role assignments for a user (or all users).")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
  .addUserOption((opt) => opt.setName("user").setDescription("Filter by user (leave blank for all)"));

export async function execute(interaction: ChatInputCommandInteraction, _client: Client) {
  await interaction.deferReply({ ephemeral: true });

  const guildId = interaction.guildId!;
  const targetUser = interaction.options.getUser("user");

  const where = targetUser
    ? { guildId, pimUser: { discordUserId: targetUser.id } }
    : { guildId };

  const assignments = await db.eligibleRole.findMany({
    where,
    include: { pimUser: true },
    orderBy: { createdAt: "desc" },
  });

  if (assignments.length === 0) {
    return interaction.editReply("No eligible role assignments found.");
  }

  const embed = new EmbedBuilder()
    .setTitle("PIM Eligible Roles")
    .setColor(0x5865f2)
    .setTimestamp();

  for (const a of assignments.slice(0, 25)) {
    embed.addFields({
      name: a.roleName,
      value: `User: <@${a.pimUser.discordUserId}> | Granted by: <@${a.grantedBy}> | <t:${Math.floor(new Date(a.createdAt).getTime() / 1000)}:D>`,
      inline: false,
    });
  }

  if (assignments.length > 25) {
    embed.setFooter({ text: `Showing 25 of ${assignments.length} assignments` });
  }

  return interaction.editReply({ embeds: [embed] });
}
