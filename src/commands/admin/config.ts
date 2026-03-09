import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  Client,
  EmbedBuilder,
  GuildMember,
  MessageFlags,
} from "discord.js";
import { db } from "../../lib/database";
import { writeAuditLog } from "../../lib/audit";
import { getOrCreateGuildConfig } from "../../lib/guildConfig";
import { isWatchtowerAdmin } from "../../lib/permissions";
import { parseDuration, formatDuration } from "../../lib/duration";

// Validation constants for duration options (all in seconds)
const SESSION_DURATION_MIN_SEC = 60;      // 1 minute minimum
const SESSION_DURATION_MAX_SEC = 86400;   // 1 day maximum
const NOTIFY_BEFORE_MIN_NONZERO_SEC = 10; // 10 seconds minimum when non-zero

export const data = new SlashCommandBuilder()
  .setName("watchtower-config")
  .setDescription("View or update Discord Watchtower configuration for this server.")
  .addStringOption((opt) =>
    opt
      .setName("session-duration")
      .setDescription("Duration before elevated role is removed (e.g. 30, 30m, 2h, 1d — bare number = minutes)")
  )
  .addIntegerOption((opt) =>
    opt
      .setName("lockout-threshold")
      .setDescription("Failed attempts before lockout")
      .setMinValue(1)
      .setMaxValue(20)
  )
  .addStringOption((opt) =>
    opt
      .setName("notify-before")
      .setDescription("Warning time before expiry (e.g. 5, 5m, 1h — bare number = minutes). Use 0 to disable")
  )
  .addChannelOption((opt) =>
    opt.setName("alert-channel").setDescription("User-facing channel: elevation granted pings and expiry warnings with Extend Session button")
  )
  .addChannelOption((opt) =>
    opt.setName("audit-channel").setDescription("Admin-facing channel: full audit log and elevation controls (Remove Permission buttons)")
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

  const sessionDurationRaw = interaction.options.getString("session-duration");
  const lockoutThreshold = interaction.options.getInteger("lockout-threshold");
  const notifyBeforeRaw = interaction.options.getString("notify-before");
  const alertChannel = interaction.options.getChannel("alert-channel");
  const auditChannel = interaction.options.getChannel("audit-channel");
  const adminRole = interaction.options.getRole("admin-role");

  if (adminRole !== null && adminRole.id === guildId) {
    return interaction.editReply(
      "The `@everyone` role cannot be used as the Watchtower Admin role — it includes all server members."
    );
  }

  // Parse and validate session-duration if provided
  let sessionDurationSec: number | undefined;
  if (sessionDurationRaw !== null) {
    const parsed = parseDuration(sessionDurationRaw);
    if (parsed === null) {
      return interaction.editReply(
        `Invalid session duration \`${sessionDurationRaw}\`. Use a number (e.g. \`30\` = 30 minutes) or add a unit suffix: \`30m\`, \`2h\`, \`1d\`.`
      );
    }
    if (parsed < SESSION_DURATION_MIN_SEC || parsed > SESSION_DURATION_MAX_SEC) {
      return interaction.editReply(
        `Session duration must be between **1m** (60s) and **1d** (86400s). Got: \`${sessionDurationRaw}\`.`
      );
    }
    // If notify-before is not being changed, check new duration against existing notifyBeforeSec
    if (notifyBeforeRaw === null && current.notifyBeforeSec > 0 && parsed <= current.notifyBeforeSec) {
      return interaction.editReply(
        `Session duration (\`${sessionDurationRaw}\`) must be greater than the current expiry warning (${formatDuration(current.notifyBeforeSec)}). ` +
        `Increase session-duration or reduce/disable notify-before first.`
      );
    }

    sessionDurationSec = parsed;
  }

  // Parse and validate notify-before if provided
  let notifyBeforeSec: number | undefined;
  if (notifyBeforeRaw !== null) {
    const parsed = parseDuration(notifyBeforeRaw);
    if (parsed === null) {
      return interaction.editReply(
        `Invalid notify-before value \`${notifyBeforeRaw}\`. Use a number (e.g. \`5\` = 5 minutes), a unit suffix (\`5m\`, \`1h\`), or \`0\` to disable.`
      );
    }
    if (parsed !== 0 && parsed < NOTIFY_BEFORE_MIN_NONZERO_SEC) {
      return interaction.editReply(
        `Notify-before must be at least **10s** when non-zero, or \`0\` to disable. Got: \`${notifyBeforeRaw}\`.`
      );
    }

    // Validate against the effective session duration (either newly set or current)
    const effectiveSessionSec = sessionDurationSec ?? current.sessionDurationSec;
    if (parsed !== 0 && parsed >= effectiveSessionSec) {
      return interaction.editReply(
        `Notify-before (\`${notifyBeforeRaw}\`) must be less than the session duration (${formatDuration(effectiveSessionSec)}). ` +
        `Reduce notify-before or increase session-duration.`
      );
    }

    notifyBeforeSec = parsed;
  }

  const adminRoleChanged = adminRole !== null;

  const updated = await db.guildConfig.update({
    where: { guildId },
    data: {
      sessionDurationSec: sessionDurationSec ?? current.sessionDurationSec,
      lockoutThreshold: lockoutThreshold ?? current.lockoutThreshold,
      notifyBeforeSec: notifyBeforeSec ?? current.notifyBeforeSec,
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

  const expiryWarningDisplay = updated.notifyBeforeSec === 0
    ? "Disabled"
    : `${formatDuration(updated.notifyBeforeSec)} before expiry`;

  const embed = new EmbedBuilder()
    .setTitle("Watchtower Configuration")
    .setColor(0x57f287)
    .addFields(
      { name: "Session Duration", value: formatDuration(updated.sessionDurationSec), inline: true },
      { name: "Expiry Warning", value: expiryWarningDisplay, inline: true },
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
