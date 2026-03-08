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
  .setName("watchtower-revoke")
  .setDescription("Revoke role eligibility from a user.")
  .setDefaultMemberPermissions(0n)
  .addUserOption((opt) => opt.setName("user").setDescription("The user").setRequired(true))
  .addRoleOption((opt) => opt.setName("role").setDescription("The role to revoke").setRequired(true));

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
  const role = interaction.options.getRole("role", true);

  const pimUser = await db.pimUser.findUnique({
    where: { discordUserId_guildId: { discordUserId: target.id, guildId } },
  });

  if (!pimUser) {
    return interaction.editReply(`<@${target.id}> does not have a PIM account.`);
  }

  const deleted = await db.eligibleRole.deleteMany({
    where: { pimUserId: pimUser.id, roleId: role.id },
  });

  if (deleted.count === 0) {
    return interaction.editReply(`<@${target.id}> was not eligible for **${role.name}**.`);
  }

  // Also remove active elevation if present
  const activeElevation = await db.activeElevation.findUnique({
    where: { pimUserId_roleId: { pimUserId: pimUser.id, roleId: role.id } },
  });

  if (activeElevation) {
    try {
      const guild = await client.guilds.fetch(guildId);
      const targetMember = await guild.members.fetch(target.id);
      await targetMember.roles.remove(role.id, `PIM eligibility revoked by ${interaction.user.tag}`);
    } catch {
      // Member may have left
    }
    await db.activeElevation.delete({ where: { id: activeElevation.id } });
    await writeAuditLog(client, {
      guildId,
      discordUserId: target.id,
      pimUserId: pimUser.id,
      eventType: "ELEVATION_REVOKED",
      roleId: role.id,
      roleName: role.name,
      metadata: { revokedBy: interaction.user.id, isWatchtowerAdmin: true },
    });
  }

  await writeAuditLog(client, {
    guildId,
    discordUserId: target.id,
    pimUserId: pimUser.id,
    eventType: "ELIGIBILITY_REVOKED",
    roleId: role.id,
    roleName: role.name,
    metadata: { revokedBy: interaction.user.id, isWatchtowerAdmin: true },
  });

  return interaction.editReply(`<@${target.id}> can no longer elevate to **${role.name}**.`);
}
