import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  Client,
  PermissionFlagsBits,
} from "discord.js";
import { db } from "../../lib/database";
import { writeAuditLog } from "../../lib/audit";

export const data = new SlashCommandBuilder()
  .setName("watchtower-assign")
  .setDescription("Assign role eligibility to a user.")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
  .addUserOption((opt) => opt.setName("user").setDescription("The user").setRequired(true))
  .addRoleOption((opt) => opt.setName("role").setDescription("The role to make eligible").setRequired(true));

export async function execute(interaction: ChatInputCommandInteraction, client: Client) {
  await interaction.deferReply({ ephemeral: true });

  const guildId = interaction.guildId!;
  const target = interaction.options.getUser("user", true);
  const role = interaction.options.getRole("role", true);

  // Ensure PIM user record exists (must have set a password first)
  const pimUser = await db.pimUser.findUnique({
    where: { discordUserId_guildId: { discordUserId: target.id, guildId } },
  });

  if (!pimUser) {
    return interaction.editReply(
      `<@${target.id}> has not set up a PIM account yet. Ask them to run \`/set-password\` first.`
    );
  }

  await db.eligibleRole.upsert({
    where: { pimUserId_roleId: { pimUserId: pimUser.id, roleId: role.id } },
    update: { grantedBy: interaction.user.id, roleName: role.name },
    create: {
      pimUserId: pimUser.id,
      roleId: role.id,
      roleName: role.name,
      guildId,
      grantedBy: interaction.user.id,
    },
  });

  await writeAuditLog(client, {
    guildId,
    discordUserId: target.id,
    pimUserId: pimUser.id,
    eventType: "ELIGIBILITY_GRANTED",
    roleId: role.id,
    roleName: role.name,
    metadata: { grantedBy: interaction.user.id },
  });

  return interaction.editReply(
    `<@${target.id}> is now eligible for **${role.name}**. They can use \`/elevate\` to request it.`
  );
}
