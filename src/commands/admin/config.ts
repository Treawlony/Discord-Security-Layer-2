import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  Client,
  PermissionFlagsBits,
  EmbedBuilder,
  GuildMember,
  MessageFlags,
} from "discord.js";
import { db } from "../../lib/database";
import { writeAuditLog } from "../../lib/audit";
import { getOrCreateGuildConfig } from "../../lib/guildConfig";
import { isWatchtowerAdmin } from "../../lib/permissions";

export const data = new SlashCommandBuilder()
  .setName("watchtower-config")
  .setDescription("View or update Discord Watchtower configuration for this server.")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addIntegerOption((opt) =>
    opt
      .setName("session-duration")
      .setDescription("Session duration in minutes before elevated role is auto-removed")
      .setMinValue(1)
      .setMaxValue(1440)
  )
  .addIntegerOption((opt) =>
    opt
      .setName("lockout-threshold")
      .setDescription("Failed attempts before lockout")
      .setMinValue(1)
      .setMaxValue(20)
  )
  .addChannelOption((opt) =>
    opt.setName("alert-channel").setDescription("Channel to post elevation alerts")
  )
  .addChannelOption((opt) =>
    opt.setName("audit-channel").setDescription("Channel to post audit log entries")
  )
  .addRoleOption((opt) =>
    opt
      .setName("admin-role")
      .setDescription("The role that can manage Watchtower (once set, this role is the sole gate)")
  );

export async function execute(interaction: ChatInputCommandInteraction, client: Client) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const guildId = interaction.guildId!;
  const current = await getOrCreateGuildConfig(guildId);
  const member = interaction.member as GuildMember;

  if (!isWatchtowerAdmin(member, current)) {
    return interaction.editReply(
      "You do not have permission to use this command.\n\nA Watchtower Admin role is required. Contact your server owner to be assigned the correct role."
    );
  }

  const sessionDuration = interaction.options.getInteger("session-duration");
  const lockoutThreshold = interaction.options.getInteger("lockout-threshold");
  const alertChannel = interaction.options.getChannel("alert-channel");
  const auditChannel = interaction.options.getChannel("audit-channel");
  const adminRole = interaction.options.getRole("admin-role");

  const adminRoleChanged = adminRole !== null;

  const updated = await db.guildConfig.update({
    where: { guildId },
    data: {
      sessionDurationMin: sessionDuration ?? current.sessionDurationMin,
      lockoutThreshold: lockoutThreshold ?? current.lockoutThreshold,
      alertChannelId: alertChannel ? alertChannel.id : current.alertChannelId,
      auditChannelId: auditChannel ? auditChannel.id : current.auditChannelId,
      adminRoleId: adminRoleChanged ? adminRole!.id : current.adminRoleId,
    },
  });

  // Emit audit log when the admin role is changed
  if (adminRoleChanged) {
    await writeAuditLog(client, {
      guildId,
      discordUserId: interaction.user.id,
      eventType: "ADMIN_ROLE_CONFIGURED",
      roleId: adminRole!.id,
      roleName: adminRole!.name,
      metadata: {
        configuredBy: interaction.user.id,
        roleId: adminRole!.id,
        roleName: adminRole!.name,
        isWatchtowerAdmin: true,
      },
    });
  }

  const adminRoleDisplay = updated.adminRoleId
    ? `<@&${updated.adminRoleId}>`
    : "Not set — using Discord Administrator";

  const embed = new EmbedBuilder()
    .setTitle("Watchtower Configuration")
    .setColor(0x57f287)
    .addFields(
      { name: "Session Duration", value: `${updated.sessionDurationMin} minutes`, inline: true },
      { name: "Lockout Threshold", value: `${updated.lockoutThreshold} attempts`, inline: true },
      { name: "Alert Channel", value: updated.alertChannelId ? `<#${updated.alertChannelId}>` : "Not set", inline: true },
      { name: "Audit Channel", value: updated.auditChannelId ? `<#${updated.auditChannelId}>` : "Not set", inline: true },
      { name: "Admin Role", value: adminRoleDisplay, inline: true }
    )
    .setTimestamp();

  const warning = adminRoleChanged
    ? "**Important:** Once the Admin Role is set, only members with that role can manage Watchtower — including running this command. Ensure you hold this role before proceeding."
    : undefined;

  return interaction.editReply({ embeds: [embed], content: warning });
}
