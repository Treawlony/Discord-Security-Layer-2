import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  Client,
  PermissionFlagsBits,
} from "discord.js";
import { db } from "../../lib/database";
import { writeAuditLog } from "../../lib/audit";

export const data = new SlashCommandBuilder()
  .setName("watchtower-revoke")
  .setDescription("Revoke role eligibility from a user.")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
  .addUserOption((opt) => opt.setName("user").setDescription("The user").setRequired(true))
  .addRoleOption((opt) => opt.setName("role").setDescription("The role to revoke").setRequired(true));

export async function execute(interaction: ChatInputCommandInteraction, client: Client) {
  await interaction.deferReply({ ephemeral: true });

  const guildId = interaction.guildId!;
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
      const member = await guild.members.fetch(target.id);
      await member.roles.remove(role.id, `PIM eligibility revoked by ${interaction.user.tag}`);
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
    });
  }

  await writeAuditLog(client, {
    guildId,
    discordUserId: target.id,
    pimUserId: pimUser.id,
    eventType: "ELIGIBILITY_REVOKED",
    roleId: role.id,
    roleName: role.name,
    metadata: { revokedBy: interaction.user.id },
  });

  return interaction.editReply(`<@${target.id}> can no longer elevate to **${role.name}**.`);
}
