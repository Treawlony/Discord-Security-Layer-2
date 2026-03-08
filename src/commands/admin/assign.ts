import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  Client,
  PermissionFlagsBits,
  GuildMember,
} from "discord.js";
import { db } from "../../lib/database";
import { writeAuditLog } from "../../lib/audit";
import { getOrCreateGuildConfig } from "../../lib/guildConfig";
import { isWatchtowerAdmin } from "../../lib/permissions";

export const data = new SlashCommandBuilder()
  .setName("watchtower-assign")
  .setDescription("Assign role eligibility to a user.")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
  .addUserOption((opt) => opt.setName("user").setDescription("The user").setRequired(true))
  .addRoleOption((opt) => opt.setName("role").setDescription("The role to make eligible").setRequired(true));

export async function execute(interaction: ChatInputCommandInteraction, client: Client) {
  await interaction.deferReply({ ephemeral: true });

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

  // Warn if assigning eligibility for the configured Watchtower Admin role
  if (config.adminRoleId && role.id === config.adminRoleId) {
    return interaction.editReply(
      `**Warning:** <@&${role.id}> is the configured Watchtower Admin role. Users should not be granted PIM eligibility for it. If you intended to assign a different role, please run the command again.`
    );
  }

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
    metadata: { grantedBy: interaction.user.id, isWatchtowerAdmin: true },
  });

  return interaction.editReply(
    `<@${target.id}> is now eligible for **${role.name}**. They can use \`/elevate\` to request it.`
  );
}
