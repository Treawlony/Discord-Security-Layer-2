import { EmbedBuilder } from "discord.js";
import { AuditEventType } from "@prisma/client";
import { eventTypeEmoji } from "./audit";

// ---------------------------------------------------------------------------
// Colour constants
// ---------------------------------------------------------------------------

export const EMBED_COLOR_GREEN  = 0x57F287; // Granted / active / extended
export const EMBED_COLOR_ORANGE = 0xFEE75C; // Warning / expiring soon
export const EMBED_COLOR_RED    = 0xED4245; // Revoked / blocked
export const EMBED_COLOR_GREY   = 0x95A5A6; // Neutral / ended / info

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

function unixOf(date: Date): number {
  return Math.floor(date.getTime() / 1000);
}

function eventTypeColor(type: AuditEventType): number {
  const GREEN_TYPES: AuditEventType[] = [
    "ELEVATION_GRANTED",
    "ELEVATION_EXTENDED",
    "ACCOUNT_UNLOCKED",
    "PASSWORD_SET",
    "PASSWORD_CHANGED",
    "PASSWORD_RESET",
    "ELIGIBILITY_GRANTED",
    "ELEVATION_REQUESTED",
  ];
  const ORANGE_TYPES: AuditEventType[] = [
    "ELEVATION_EXPIRY_WARNING",
    "FAILED_ATTEMPT",
  ];
  const RED_TYPES: AuditEventType[] = [
    "ELEVATION_REVOKED",
    "ELEVATION_EXPIRED",
    "ELEVATION_ADMIN_REVOKED",
    "ELEVATION_ADMIN_REVOKED_BLOCKED",
    "ELEVATION_BLOCKED",
    "ACCOUNT_LOCKED",
    "ELIGIBILITY_REVOKED",
  ];

  if ((GREEN_TYPES as string[]).includes(type))  return EMBED_COLOR_GREEN;
  if ((ORANGE_TYPES as string[]).includes(type)) return EMBED_COLOR_ORANGE;
  if ((RED_TYPES as string[]).includes(type))    return EMBED_COLOR_RED;
  return EMBED_COLOR_GREY;
}

function eventTypeLabel(type: AuditEventType): string {
  const map: Partial<Record<AuditEventType, string>> = {
    ELEVATION_GRANTED:              "Elevation Granted",
    ELEVATION_EXPIRED:              "Elevation Expired",
    ELEVATION_REVOKED:              "Elevation Revoked",
    ELEVATION_REQUESTED:            "Elevation Requested",
    ELEVATION_SELF_REVOKED:         "Session Self-Revoked",
    ELEVATION_EXTENDED:             "Session Extended",
    ELEVATION_ADMIN_REVOKED:        "Admin Revoked",
    ELEVATION_ADMIN_REVOKED_BLOCKED:"Admin Revoked and Blocked",
    ELEVATION_BLOCKED:              "Account Blocked",
    ELEVATION_EXPIRY_WARNING:       "Expiry Warning",
    FAILED_ATTEMPT:                 "Failed Attempt",
    ACCOUNT_LOCKED:                 "Account Locked",
    ACCOUNT_UNLOCKED:               "Account Unlocked",
    PASSWORD_SET:                   "Password Set",
    PASSWORD_CHANGED:               "Password Changed",
    PASSWORD_RESET:                 "Password Reset",
    ELIGIBILITY_GRANTED:            "Eligibility Granted",
    ELIGIBILITY_REVOKED:            "Eligibility Revoked",
  };
  return map[type] ?? type;
}

// ---------------------------------------------------------------------------
// Elevation granted
// ---------------------------------------------------------------------------

/**
 * Audit-channel embed for a successful PIM elevation.
 * Admin-facing: includes inline User / Role / Expires fields.
 */
export function buildElevationGrantedAuditEmbed(
  userId: string,
  roleName: string,
  expiresAt: Date
): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(EMBED_COLOR_GREEN)
    .setTitle("PIM Elevation Granted")
    .addFields(
      { name: "User",    value: `<@${userId}>`,                       inline: true },
      { name: "Role",    value: roleName,                              inline: true },
      { name: "Expires", value: `<t:${unixOf(expiresAt)}:R>`,         inline: true }
    )
    .setTimestamp();
}

/**
 * Alert-channel embed for a successful PIM elevation.
 * User-facing: conversational description with mention.
 */
export function buildElevationGrantedAlertEmbed(
  userId: string,
  roleName: string,
  expiresAt: Date
): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(EMBED_COLOR_GREEN)
    .setTitle("Role Elevated")
    .setDescription(
      `<@${userId}>, you have been granted **${roleName}** until <t:${unixOf(expiresAt)}:R>.`
    )
    .setTimestamp();
}

// ---------------------------------------------------------------------------
// Expiry warning
// ---------------------------------------------------------------------------

/**
 * Alert-channel embed for an upcoming session expiry.
 * User-facing: prompts user to extend their session.
 */
export function buildExpiryWarningAlertEmbed(
  userId: string,
  roleName: string,
  expiresAt: Date
): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(EMBED_COLOR_ORANGE)
    .setTitle("Session Expiring Soon")
    .setDescription(
      `<@${userId}>, your **${roleName}** elevation expires <t:${unixOf(expiresAt)}:R>. ` +
      `Click **Extend Session** to reset your timer.`
    )
    .setTimestamp();
}

/**
 * Audit-channel embed for an upcoming session expiry.
 * Admin-facing: inline fields matching the elevation-granted audit embed style.
 */
export function buildExpiryWarningAuditEmbed(
  userId: string,
  roleName: string,
  expiresAt: Date
): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(EMBED_COLOR_ORANGE)
    .setTitle("Expiry Warning")
    .addFields(
      { name: "User",    value: `<@${userId}>`,               inline: true },
      { name: "Role",    value: roleName,                      inline: true },
      { name: "Expires", value: `<t:${unixOf(expiresAt)}:R>`, inline: true }
    )
    .setTimestamp();
}

// ---------------------------------------------------------------------------
// Session ended
// ---------------------------------------------------------------------------

/**
 * Audit-channel embed when the user self-revokes their elevation.
 * Tells admins the session ended voluntarily and eligibility is intact.
 */
export function buildSelfRevokedAuditEmbed(
  userId: string,
  roleName: string
): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(EMBED_COLOR_GREY)
    .setTitle("Session Self-Revoked")
    .setDescription(
      `<@${userId}>'s **${roleName}** session was ended early by the user. ` +
      `Role removed; eligibility intact.`
    )
    .setTimestamp();
}

/**
 * Audit-channel embed when an admin removes a user's elevation without blocking.
 */
export function buildAdminRevokedAuditEmbed(
  userId: string,
  roleName: string
): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(EMBED_COLOR_RED)
    .setTitle("Permission Removed")
    .setDescription(
      `<@${userId}>'s **${roleName}** elevation was revoked by an administrator.`
    )
    .setTimestamp();
}

/**
 * Audit-channel embed when an admin removes a user's elevation AND blocks their account.
 */
export function buildAdminRevokedBlockedAuditEmbed(
  userId: string,
  roleName: string
): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(EMBED_COLOR_RED)
    .setTitle("Permission Removed and User Blocked")
    .setDescription(
      `<@${userId}>'s **${roleName}** elevation was revoked and their PIM account has been ` +
      `blocked by an administrator. Use \`/watchtower-unlock\` to restore their access.`
    )
    .setTimestamp();
}

// ---------------------------------------------------------------------------
// Extend session
// ---------------------------------------------------------------------------

/**
 * Replaces the expiry-warning alert embed after the user extends their session.
 * Confirms the new expiry time.
 */
export function buildExtendedSessionEmbed(
  userId: string,
  roleName: string,
  newExpiresAt: Date
): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(EMBED_COLOR_GREEN)
    .setTitle("Session Extended")
    .setDescription(
      `<@${userId}>, your **${roleName}** session has been extended until <t:${unixOf(newExpiresAt)}:R>.`
    )
    .setTimestamp();
}

// ---------------------------------------------------------------------------
// Generic audit log embed (used by writeAuditLog default channel post)
// ---------------------------------------------------------------------------

/**
 * Generic embed for any audit event posted to the audit channel by writeAuditLog.
 * Colour and title are derived from the event type. Role field is omitted if absent.
 */
export function buildAuditLogEmbed(
  eventType: AuditEventType,
  userId: string,
  timestamp: Date,
  roleName?: string
): EmbedBuilder {
  const emoji = eventTypeEmoji(eventType);
  const label = eventTypeLabel(eventType);
  const color = eventTypeColor(eventType);

  const fields: { name: string; value: string; inline: boolean }[] = [
    { name: "User", value: `<@${userId}>`, inline: true },
  ];

  if (roleName) {
    fields.push({ name: "Role", value: roleName, inline: true });
  }

  fields.push({ name: "When", value: `<t:${unixOf(timestamp)}:R>`, inline: true });

  return new EmbedBuilder()
    .setColor(color)
    .setTitle(`${emoji} ${label}`)
    .addFields(fields)
    .setTimestamp(timestamp);
}
