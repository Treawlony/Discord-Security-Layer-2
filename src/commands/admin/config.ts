import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  Client,
  PermissionFlagsBits,
  EmbedBuilder,
} from "discord.js";
import { db } from "../../lib/database";
import { getOrCreateGuildConfig } from "../../lib/guildConfig";

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
  );

export async function execute(interaction: ChatInputCommandInteraction, _client: Client) {
  await interaction.deferReply({ ephemeral: true });

  const guildId = interaction.guildId!;
  const sessionDuration = interaction.options.getInteger("session-duration");
  const lockoutThreshold = interaction.options.getInteger("lockout-threshold");
  const alertChannel = interaction.options.getChannel("alert-channel");
  const auditChannel = interaction.options.getChannel("audit-channel");

  const current = await getOrCreateGuildConfig(guildId);

  const updated = await db.guildConfig.update({
    where: { guildId },
    data: {
      sessionDurationMin: sessionDuration ?? current.sessionDurationMin,
      lockoutThreshold: lockoutThreshold ?? current.lockoutThreshold,
      alertChannelId: alertChannel ? alertChannel.id : current.alertChannelId,
      auditChannelId: auditChannel ? auditChannel.id : current.auditChannelId,
    },
  });

  const embed = new EmbedBuilder()
    .setTitle("Watchtower Configuration")
    .setColor(0x57f287)
    .addFields(
      { name: "Session Duration", value: `${updated.sessionDurationMin} minutes`, inline: true },
      { name: "Lockout Threshold", value: `${updated.lockoutThreshold} attempts`, inline: true },
      { name: "Alert Channel", value: updated.alertChannelId ? `<#${updated.alertChannelId}>` : "Not set", inline: true },
      { name: "Audit Channel", value: updated.auditChannelId ? `<#${updated.auditChannelId}>` : "Not set", inline: true }
    )
    .setTimestamp();

  return interaction.editReply({ embeds: [embed] });
}
