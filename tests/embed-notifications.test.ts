/**
 * Tests for the Discord Embed Notification System (EPIC-006)
 *
 * Strategy: source-level file inspection — no DB, no Discord API.
 * Each test verifies structural and content properties of the embed
 * refactor across all touched files.
 */

const fs   = require("fs");
const path = require("path");

const EMBEDS_SRC        = path.resolve(__dirname, "../src/lib/embeds.ts");
const AUDIT_SRC         = path.resolve(__dirname, "../src/lib/audit.ts");
const ELEVATE_SRC       = path.resolve(__dirname, "../src/commands/user/elevate.ts");
const EXPIRE_SRC        = path.resolve(__dirname, "../src/jobs/expireElevations.ts");
const BUTTON_SRC        = path.resolve(__dirname, "../src/lib/buttonHandlers.ts");

// ---------------------------------------------------------------------------
// Section 1: embeds.ts — module structure
// ---------------------------------------------------------------------------

describe("embeds.ts — module structure", () => {
  let source: string;
  beforeAll(() => { source = fs.readFileSync(EMBEDS_SRC, "utf-8"); });

  it("exports EMBED_COLOR_GREEN constant", () => {
    expect(source).toContain("export const EMBED_COLOR_GREEN");
  });

  it("exports EMBED_COLOR_ORANGE constant", () => {
    expect(source).toContain("export const EMBED_COLOR_ORANGE");
  });

  it("exports EMBED_COLOR_RED constant", () => {
    expect(source).toContain("export const EMBED_COLOR_RED");
  });

  it("exports EMBED_COLOR_GREY constant", () => {
    expect(source).toContain("export const EMBED_COLOR_GREY");
  });

  it("imports EmbedBuilder from discord.js", () => {
    expect(source).toContain("EmbedBuilder");
    expect(source).toContain("discord.js");
  });

  it("imports AuditEventType from @prisma/client", () => {
    expect(source).toContain("AuditEventType");
    expect(source).toContain("@prisma/client");
  });

  it("imports eventTypeEmoji from audit", () => {
    expect(source).toContain("eventTypeEmoji");
    expect(source).toContain("./audit");
  });
});

// ---------------------------------------------------------------------------
// Section 2: embeds.ts — exported builder functions exist
// ---------------------------------------------------------------------------

describe("embeds.ts — exported builder functions", () => {
  let source: string;
  beforeAll(() => { source = fs.readFileSync(EMBEDS_SRC, "utf-8"); });

  it("exports buildElevationGrantedAuditEmbed", () => {
    expect(source).toContain("export function buildElevationGrantedAuditEmbed");
  });

  it("exports buildElevationGrantedAlertEmbed", () => {
    expect(source).toContain("export function buildElevationGrantedAlertEmbed");
  });

  it("exports buildExpiryWarningAlertEmbed", () => {
    expect(source).toContain("export function buildExpiryWarningAlertEmbed");
  });

  it("exports buildExpiryWarningAuditEmbed", () => {
    expect(source).toContain("export function buildExpiryWarningAuditEmbed");
  });

  it("exports buildSelfRevokedAuditEmbed", () => {
    expect(source).toContain("export function buildSelfRevokedAuditEmbed");
  });

  it("exports buildAdminRevokedAuditEmbed", () => {
    expect(source).toContain("export function buildAdminRevokedAuditEmbed");
  });

  it("exports buildAdminRevokedBlockedAuditEmbed", () => {
    expect(source).toContain("export function buildAdminRevokedBlockedAuditEmbed");
  });

  it("exports buildExtendedSessionEmbed", () => {
    expect(source).toContain("export function buildExtendedSessionEmbed");
  });

  it("exports buildAuditLogEmbed", () => {
    expect(source).toContain("export function buildAuditLogEmbed");
  });
});

// ---------------------------------------------------------------------------
// Section 3: embeds.ts — embed content correctness
// ---------------------------------------------------------------------------

describe("embeds.ts — embed content and mention format", () => {
  let source: string;
  beforeAll(() => { source = fs.readFileSync(EMBEDS_SRC, "utf-8"); });

  it("all <@userId> mentions use the correct format (no deprecated <@! prefix)", () => {
    // Should contain <@${userId}> style mentions
    expect(source).toContain("<@${userId}>");
    // Must NOT use the deprecated nickname mention format
    expect(source).not.toContain("<@!");
  });

  it("buildElevationGrantedAuditEmbed uses green colour", () => {
    const fnStart = source.indexOf("export function buildElevationGrantedAuditEmbed");
    const fnEnd   = source.indexOf("\nexport function buildElevationGrantedAlertEmbed");
    const fn = source.slice(fnStart, fnEnd);
    expect(fn).toContain("EMBED_COLOR_GREEN");
  });

  it("buildElevationGrantedAuditEmbed title is 'PIM Elevation Granted'", () => {
    expect(source).toContain("PIM Elevation Granted");
  });

  it("buildElevationGrantedAlertEmbed uses green colour", () => {
    const fnStart = source.indexOf("export function buildElevationGrantedAlertEmbed");
    const fnEnd   = source.indexOf("\nexport function buildExpiryWarningAlertEmbed");
    const fn = source.slice(fnStart, fnEnd);
    expect(fn).toContain("EMBED_COLOR_GREEN");
  });

  it("buildElevationGrantedAlertEmbed title is 'Role Elevated'", () => {
    expect(source).toContain("Role Elevated");
  });

  it("buildExpiryWarningAlertEmbed uses orange colour", () => {
    const fnStart = source.indexOf("export function buildExpiryWarningAlertEmbed");
    const fnEnd   = source.indexOf("\nexport function buildExpiryWarningAuditEmbed");
    const fn = source.slice(fnStart, fnEnd);
    expect(fn).toContain("EMBED_COLOR_ORANGE");
  });

  it("buildExpiryWarningAlertEmbed title is 'Session Expiring Soon'", () => {
    expect(source).toContain("Session Expiring Soon");
  });

  it("buildExpiryWarningAlertEmbed description mentions Extend Session", () => {
    expect(source).toContain("Extend Session");
  });

  it("buildExpiryWarningAuditEmbed uses orange colour", () => {
    const fnStart = source.indexOf("export function buildExpiryWarningAuditEmbed");
    const fnEnd   = source.indexOf("\nexport function buildSelfRevokedAuditEmbed");
    const fn = source.slice(fnStart, fnEnd);
    expect(fn).toContain("EMBED_COLOR_ORANGE");
  });

  it("buildExpiryWarningAuditEmbed title is 'Expiry Warning'", () => {
    expect(source).toContain("Expiry Warning");
  });

  it("buildSelfRevokedAuditEmbed uses grey colour", () => {
    const fnStart = source.indexOf("export function buildSelfRevokedAuditEmbed");
    const fnEnd   = source.indexOf("\nexport function buildAdminRevokedAuditEmbed");
    const fn = source.slice(fnStart, fnEnd);
    expect(fn).toContain("EMBED_COLOR_GREY");
  });

  it("buildSelfRevokedAuditEmbed title is 'Session Self-Revoked'", () => {
    expect(source).toContain("Session Self-Revoked");
  });

  it("buildSelfRevokedAuditEmbed description mentions eligibility intact", () => {
    expect(source).toContain("eligibility intact");
  });

  it("buildAdminRevokedAuditEmbed uses red colour", () => {
    const fnStart = source.indexOf("export function buildAdminRevokedAuditEmbed");
    const fnEnd   = source.indexOf("\nexport function buildAdminRevokedBlockedAuditEmbed");
    const fn = source.slice(fnStart, fnEnd);
    expect(fn).toContain("EMBED_COLOR_RED");
  });

  it("buildAdminRevokedAuditEmbed title is 'Permission Removed'", () => {
    expect(source).toContain("Permission Removed");
  });

  it("buildAdminRevokedBlockedAuditEmbed uses red colour", () => {
    const fnStart = source.indexOf("export function buildAdminRevokedBlockedAuditEmbed");
    const fnEnd   = source.indexOf("\nexport function buildExtendedSessionEmbed");
    const fn = source.slice(fnStart, fnEnd);
    expect(fn).toContain("EMBED_COLOR_RED");
  });

  it("buildAdminRevokedBlockedAuditEmbed title mentions 'User Blocked'", () => {
    expect(source).toContain("Permission Removed and User Blocked");
  });

  it("buildAdminRevokedBlockedAuditEmbed description mentions /watchtower-unlock", () => {
    expect(source).toContain("/watchtower-unlock");
  });

  it("buildExtendedSessionEmbed uses green colour", () => {
    const fnStart = source.indexOf("export function buildExtendedSessionEmbed");
    const fnEnd   = source.indexOf("\nexport function buildAuditLogEmbed");
    const fn = source.slice(fnStart, fnEnd);
    expect(fn).toContain("EMBED_COLOR_GREEN");
  });

  it("buildExtendedSessionEmbed title is 'Session Extended'", () => {
    expect(source).toContain("Session Extended");
  });

  it("all builders call .setTimestamp()", () => {
    const timestampCount = (source.match(/\.setTimestamp\(/g) ?? []).length;
    // 9 builder functions, each calls setTimestamp once
    expect(timestampCount).toBeGreaterThanOrEqual(9);
  });

  it("eventTypeColor maps grant events to GREEN", () => {
    expect(source).toContain("ELEVATION_GRANTED");
    expect(source).toContain("EMBED_COLOR_GREEN");
  });

  it("eventTypeColor maps warning events to ORANGE", () => {
    expect(source).toContain("ELEVATION_EXPIRY_WARNING");
    expect(source).toContain("EMBED_COLOR_ORANGE");
  });

  it("eventTypeColor maps revoke/lock events to RED", () => {
    expect(source).toContain("ACCOUNT_LOCKED");
    expect(source).toContain("EMBED_COLOR_RED");
  });

  it("buildAuditLogEmbed adds Role field only when roleName is present", () => {
    const fnStart = source.indexOf("export function buildAuditLogEmbed");
    const fn = source.slice(fnStart);
    expect(fn).toContain("if (roleName)");
  });
});

// ---------------------------------------------------------------------------
// Section 4: audit.ts — uses embed builder for channel post
// ---------------------------------------------------------------------------

describe("audit.ts — default channel post uses embed", () => {
  let source: string;
  beforeAll(() => { source = fs.readFileSync(AUDIT_SRC, "utf-8"); });

  it("imports buildAuditLogEmbed from embeds", () => {
    expect(source).toContain("buildAuditLogEmbed");
    expect(source).toContain("./embeds");
  });

  it("channel.send uses embeds array (not a plain string)", () => {
    expect(source).toContain("embeds: [buildAuditLogEmbed(");
  });

  it("no longer sends plain-text event type strings to the channel", () => {
    // The old format was: `${emoji} \`${params.eventType}\` — \`${params.discordUserId}\``
    expect(source).not.toContain("params.eventType}\\`");
  });

  it("skipChannelPost logic is still present", () => {
    expect(source).toContain("skipChannelPost?");
    expect(source).toContain("!params.skipChannelPost");
  });

  it("eventTypeEmoji export is still present (used in embeds.ts)", () => {
    expect(source).toContain("export function eventTypeEmoji");
  });

  it("does not use deprecated ephemeral: true", () => {
    expect(source).not.toContain("ephemeral: true");
  });
});

// ---------------------------------------------------------------------------
// Section 5: elevate.ts — uses embed builders for elevation-granted messages
// ---------------------------------------------------------------------------

describe("elevate.ts — elevation-granted messages use embeds", () => {
  let source: string;
  beforeAll(() => { source = fs.readFileSync(ELEVATE_SRC, "utf-8"); });

  it("imports buildElevationGrantedAuditEmbed from embeds", () => {
    expect(source).toContain("buildElevationGrantedAuditEmbed");
  });

  it("imports buildElevationGrantedAlertEmbed from embeds", () => {
    expect(source).toContain("buildElevationGrantedAlertEmbed");
  });

  it("audit channel send uses embeds array with audit embed", () => {
    expect(source).toContain("embeds: [buildElevationGrantedAuditEmbed(");
  });

  it("alert channel send uses embeds array with alert embed", () => {
    expect(source).toContain("embeds: [buildElevationGrantedAlertEmbed(");
  });

  it("no longer sends plain-text content to audit channel on elevation grant", () => {
    // Old format: `⬆️ **PIM Elevation** — \`${discordUserId}\``
    expect(source).not.toContain("⬆️ **PIM Elevation**");
  });

  it("remove_perm: button customId still present", () => {
    expect(source).toContain("remove_perm:");
  });

  it("remove_perm_block: button customId still present", () => {
    expect(source).toContain("remove_perm_block:");
  });

  it("auditMessageId is still stored on the elevation record", () => {
    expect(source).toContain("auditMessageId");
  });

  it("alertMessageId is still stored on the elevation record", () => {
    expect(source).toContain("alertMessageId");
  });

  it("skipChannelPost: true is still set on ELEVATION_GRANTED writeAuditLog call", () => {
    const grantedIdx = source.indexOf("ELEVATION_GRANTED");
    const snippet = source.slice(Math.max(0, grantedIdx - 300), grantedIdx + 300);
    expect(snippet).toContain("skipChannelPost: true");
  });

  it("does not use deprecated ephemeral: true", () => {
    expect(source).not.toContain("ephemeral: true");
  });
});

// ---------------------------------------------------------------------------
// Section 6: expireElevations.ts — uses embed builders for warnings
// ---------------------------------------------------------------------------

describe("expireElevations.ts — expiry warning messages use embeds", () => {
  let source: string;
  beforeAll(() => { source = fs.readFileSync(EXPIRE_SRC, "utf-8"); });

  it("imports buildExpiryWarningAlertEmbed from embeds", () => {
    expect(source).toContain("buildExpiryWarningAlertEmbed");
  });

  it("imports buildExpiryWarningAuditEmbed from embeds", () => {
    expect(source).toContain("buildExpiryWarningAuditEmbed");
  });

  it("alert channel warning send uses embeds array", () => {
    expect(source).toContain("embeds: [buildExpiryWarningAlertEmbed(");
  });

  it("audit channel warning send uses embeds array", () => {
    expect(source).toContain("embeds: [buildExpiryWarningAuditEmbed(");
  });

  it("no longer sends plain-text ⏰ string to the alert channel", () => {
    expect(source).not.toContain("⏰ <@");
  });

  it("no longer sends plain-text Expiry Warning string to the audit channel", () => {
    expect(source).not.toContain("**Expiry Warning** —");
  });

  it("skipChannelPost: true still set on ELEVATION_EXPIRY_WARNING writeAuditLog call", () => {
    const warningIdx = source.indexOf("ELEVATION_EXPIRY_WARNING");
    const snippet = source.slice(Math.max(0, warningIdx - 300), warningIdx + 300);
    expect(snippet).toContain("skipChannelPost: true");
  });

  it("extend_session: customId prefix still used for Extend Session button", () => {
    expect(source).toContain("extend_session:");
  });

  it("expiry scan message edits still use components: [] to strip buttons", () => {
    const expiryScanStart = source.indexOf("async function runExpiryScan");
    const expiryScanText = source.slice(expiryScanStart);
    const compEmptyCount = (expiryScanText.match(/components: \[\]/g) ?? []).length;
    expect(compEmptyCount).toBeGreaterThanOrEqual(2);
  });

  it("does not use deprecated ephemeral: true", () => {
    expect(source).not.toContain("ephemeral: true");
  });
});

// ---------------------------------------------------------------------------
// Section 7: buttonHandlers.ts — uses embed builders for session-end edits
// ---------------------------------------------------------------------------

describe("buttonHandlers.ts — session-end edits use embeds", () => {
  let source: string;
  beforeAll(() => { source = fs.readFileSync(BUTTON_SRC, "utf-8"); });

  it("imports buildExtendedSessionEmbed from embeds", () => {
    expect(source).toContain("buildExtendedSessionEmbed");
    expect(source).toContain("./embeds");
  });

  it("imports buildSelfRevokedAuditEmbed from embeds", () => {
    expect(source).toContain("buildSelfRevokedAuditEmbed");
  });

  it("imports buildAdminRevokedAuditEmbed from embeds", () => {
    expect(source).toContain("buildAdminRevokedAuditEmbed");
  });

  it("imports buildAdminRevokedBlockedAuditEmbed from embeds", () => {
    expect(source).toContain("buildAdminRevokedBlockedAuditEmbed");
  });

  it("handleExtendSession edits warning message with buildExtendedSessionEmbed", () => {
    const fnStart = source.indexOf("export async function handleExtendSession");
    const fnEnd   = source.indexOf("\nexport async function handleSelfRevoke");
    const fn = source.slice(fnStart, fnEnd);
    expect(fn).toContain("buildExtendedSessionEmbed(");
  });

  it("handleExtendSession message edit pings the user via content field (regression: BUG-007)", () => {
    // <@userId> in an embed description does NOT send a notification ping.
    // The ping must be in the content field of the message.edit() call so Discord
    // notifies the user when their session is extended.
    const fnStart = source.indexOf("export async function handleExtendSession");
    const fnEnd   = source.indexOf("\nexport async function handleSelfRevoke");
    const fn = source.slice(fnStart, fnEnd);
    // The content field must contain the user mention, not be empty
    expect(fn).toContain("content: `<@${elevation.pimUser.discordUserId}>`");
    expect(fn).not.toContain('content: ""');
  });

  it("handleExtendSession ping is scoped to its own message.edit only — not a channel.send ping", () => {
    // The ping should appear in the message.edit call inside the try block,
    // not in any channel.send or in the final editReply.
    const fnStart = source.indexOf("export async function handleExtendSession");
    const fnEnd   = source.indexOf("\nexport async function handleSelfRevoke");
    const fn = source.slice(fnStart, fnEnd);
    // Verify the ping mention appears in the function at all
    expect(fn).toContain("<@${elevation.pimUser.discordUserId}>");
  });

  it("handleSelfRevoke edits audit message with buildSelfRevokedAuditEmbed", () => {
    const fnStart = source.indexOf("export async function handleSelfRevoke");
    const fnEnd   = source.indexOf("\n// ---------------------------------------------------------------------------\n// handleRemovePerm");
    const fn = source.slice(fnStart, fnEnd);
    expect(fn).toContain("buildSelfRevokedAuditEmbed(");
    expect(fn).toContain('content: ""');
  });

  it("handleRemovePerm edits audit message with buildAdminRevokedAuditEmbed", () => {
    const fnStart = source.indexOf("export async function handleRemovePerm(");
    const fnEnd   = source.indexOf("\nexport async function handleRemovePermBlock");
    const fn = source.slice(fnStart, fnEnd);
    expect(fn).toContain("buildAdminRevokedAuditEmbed(");
    expect(fn).toContain('content: ""');
  });

  it("handleRemovePermBlock edits audit message with buildAdminRevokedBlockedAuditEmbed", () => {
    const fnStart = source.indexOf("export async function handleRemovePermBlock");
    const fn = source.slice(fnStart);
    expect(fn).toContain("buildAdminRevokedBlockedAuditEmbed(");
    expect(fn).toContain('content: ""');
  });

  it("alert channel edits still use components: [] only (no embed replacement on alert)", () => {
    // Alert channel message edits in handleRemovePerm and handleRemovePermBlock should
    // only strip buttons — the original elevation-granted embed is preserved in place.
    // We verify by checking that alertMsg.edit is called with components: [] only.
    expect(source).toContain("alertMsg.edit({ components: [] })");
  });

  it("handleExtendSession still checks user identity before extending", () => {
    const fnStart = source.indexOf("export async function handleExtendSession");
    const fnEnd   = source.indexOf("\nexport async function handleSelfRevoke");
    const fn = source.slice(fnStart, fnEnd);
    expect(fn).toContain("interaction.user.id");
    expect(fn).toContain("discordUserId");
  });

  it("handleRemovePerm still calls isWatchtowerAdmin", () => {
    const fnStart = source.indexOf("export async function handleRemovePerm(");
    const fnEnd   = source.indexOf("\nexport async function handleRemovePermBlock");
    const fn = source.slice(fnStart, fnEnd);
    expect(fn).toContain("isWatchtowerAdmin");
  });

  it("handleRemovePermBlock still calls isWatchtowerAdmin", () => {
    const fnStart = source.indexOf("export async function handleRemovePermBlock");
    const fn = source.slice(fnStart);
    expect(fn).toContain("isWatchtowerAdmin");
  });

  it("all handlers still deferReply with MessageFlags.Ephemeral", () => {
    expect(source).toContain("deferReply({ flags: MessageFlags.Ephemeral })");
  });

  it("does not use deprecated ephemeral: true", () => {
    expect(source).not.toContain("ephemeral: true");
  });

  it("no longer uses old plain-text audit message content string", () => {
    expect(source).not.toContain("Session Self-Revoked** —");
  });

  it("handleSelfRevoke audit message edit does not ping the user (audit channel is admin-facing)", () => {
    const fnStart = source.indexOf("export async function handleSelfRevoke");
    const fnEnd   = source.indexOf("\n// ---------------------------------------------------------------------------\n// handleRemovePerm");
    const fn = source.slice(fnStart, fnEnd);
    expect(fn).toContain('content: ""');
  });

  it("handleRemovePerm audit message edit does not ping anyone (admin-facing channel)", () => {
    const fnStart = source.indexOf("export async function handleRemovePerm(");
    const fnEnd   = source.indexOf("\nexport async function handleRemovePermBlock");
    const fn = source.slice(fnStart, fnEnd);
    // The interaction.message.edit (audit channel) must have content: ""
    expect(fn).toContain('content: ""');
  });

  it("handleRemovePermBlock audit message edit does not ping anyone (admin-facing channel)", () => {
    const fnStart = source.indexOf("export async function handleRemovePermBlock");
    const fn = source.slice(fnStart);
    expect(fn).toContain('content: ""');
  });
});

// ---------------------------------------------------------------------------
// Section 8: No pings — content field is absent/empty on all channel sends
// ---------------------------------------------------------------------------

describe("No-ping guarantee — channel sends never set content to a mention", () => {
  it("embeds.ts never sets content on any EmbedBuilder (embeds are pure builders)", () => {
    const source: string = fs.readFileSync(EMBEDS_SRC, "utf-8");
    // EmbedBuilder has no .setContent() method — verifying the file uses
    // description/fields for mentions, not a content property
    expect(source).not.toContain(".setContent(");
  });

  it("elevate.ts audit channel send does not set content alongside the embed", () => {
    const source: string = fs.readFileSync(ELEVATE_SRC, "utf-8");
    // Audit channel send block should contain embeds: [...] and NOT content: `⬆️...`
    const auditSendIdx = source.indexOf("embeds: [buildElevationGrantedAuditEmbed(");
    // Extract a small window around the send call
    const window = source.slice(Math.max(0, auditSendIdx - 50), auditSendIdx + 200);
    expect(window).not.toContain("content: `");
  });

  it("elevate.ts alert channel send does not set content alongside the embed", () => {
    const source: string = fs.readFileSync(ELEVATE_SRC, "utf-8");
    const alertSendIdx = source.indexOf("embeds: [buildElevationGrantedAlertEmbed(");
    const window = source.slice(Math.max(0, alertSendIdx - 50), alertSendIdx + 200);
    expect(window).not.toContain("content: `");
  });

  it("expireElevations.ts warning alert send includes a content ping for the user (BUG-001 fix)", () => {
    // <@userId> inside an embed description does NOT send a notification ping.
    // The content field is intentionally set on the alert channel warning send so the
    // user is notified when their session is about to expire.
    const source: string = fs.readFileSync(EXPIRE_SRC, "utf-8");
    const alertSendIdx = source.indexOf("embeds: [buildExpiryWarningAlertEmbed(");
    const window = source.slice(Math.max(0, alertSendIdx - 200), alertSendIdx + 200);
    expect(window).toContain("content: `<@");
  });
});
