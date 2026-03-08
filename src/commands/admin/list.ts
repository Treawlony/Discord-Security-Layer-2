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

export const data = new SlashCommandBuilder()
  .setName("watchtower-list")
  .setDescription("List all PIM eligible role assignments for a user (or all users).")
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
