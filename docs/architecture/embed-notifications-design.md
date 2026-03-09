# Technical Design: Discord Embed Notification System (EPIC-006)

## Overview

This document describes the technical architecture for converting all Discord Watchtower
channel-posted messages from plain-text strings to Discord embeds using discord.js v14
`EmbedBuilder`. No database schema changes are required. No new environment variables are
needed. The change is purely a presentation-layer refactor.

---

## Architecture Diagram

```
  Callers                    New Module             discord.js v14
  ─────────────────          ─────────────────      ──────────────
  src/lib/audit.ts     ───►  src/lib/embeds.ts  ──► EmbedBuilder
  src/commands/user/          buildAuditLogEmbed()
    elevate.ts         ───►   buildElevationGrantedAuditEmbed()
                               buildElevationGrantedAlertEmbed()
  src/jobs/                   buildExpiryWarningAlertEmbed()
    expireElevations.ts ──►   buildExpiryWarningAuditEmbed()
                               buildSelfRevokedAuditEmbed()
  src/lib/                    buildAdminRevokedAuditEmbed()
    buttonHandlers.ts  ───►   buildAdminRevokedBlockedAuditEmbed()
                               buildExtendedSessionEmbed()
```

All builder functions are **pure** — they accept primitives and return an `EmbedBuilder`
instance. No I/O, no DB calls, no Discord API calls inside `embeds.ts`.

---

## New File: `src/lib/embeds.ts`

### Purpose
Single source of truth for every embed template used by channel posts. Keeps construction
logic DRY and ensures consistent colour, field layout, and timestamp across all callers.

### Exports

```typescript
import { EmbedBuilder } from "discord.js";

// Colour constants (exported for use in tests)
export const EMBED_COLOR_GREEN  = 0x57F287;  // Granted / active / extended
export const EMBED_COLOR_ORANGE = 0xFEE75C;  // Warning / expiry
export const EMBED_COLOR_RED    = 0xED4245;  // Revoked / blocked
export const EMBED_COLOR_GREY   = 0x95A5A6;  // Neutral / ended / info

// ── Elevation granted ───────────────────────────────────────────────────────

export function buildElevationGrantedAuditEmbed(
  userId: string,
  roleName: string,
  expiresAt: Date
): EmbedBuilder;
// Returns: green embed, title "PIM Elevation Granted", inline fields:
//   User=<@userId>, Role=roleName, Expires=<t:unix:R>

export function buildElevationGrantedAlertEmbed(
  userId: string,
  roleName: string,
  expiresAt: Date
): EmbedBuilder;
// Returns: green embed, title "Role Elevated",
//   description: "<@userId>, you have been granted **{roleName}** until <t:unix:R>."

// ── Expiry warning ──────────────────────────────────────────────────────────

export function buildExpiryWarningAlertEmbed(
  userId: string,
  roleName: string,
  expiresAt: Date
): EmbedBuilder;
// Returns: orange embed, title "Session Expiring Soon",
//   description: "<@userId>, your **{roleName}** elevation expires <t:unix:R>.
//                Click **Extend Session** to reset your timer."

export function buildExpiryWarningAuditEmbed(
  userId: string,
  roleName: string,
  expiresAt: Date
): EmbedBuilder;
// Returns: orange embed, title "Expiry Warning", inline fields:
//   User=<@userId>, Role=roleName, Expires=<t:unix:R>

// ── Session ended ───────────────────────────────────────────────────────────

export function buildSelfRevokedAuditEmbed(
  userId: string,
  roleName: string
): EmbedBuilder;
// Returns: grey embed, title "Session Self-Revoked",
//   description: "<@userId>'s **{roleName}** session was ended early by the user.
//                Role removed; eligibility intact."

export function buildAdminRevokedAuditEmbed(
  userId: string,
  roleName: string
): EmbedBuilder;
// Returns: red embed, title "Permission Removed",
//   description: "<@userId>'s **{roleName}** elevation was revoked by an administrator."

export function buildAdminRevokedBlockedAuditEmbed(
  userId: string,
  roleName: string
): EmbedBuilder;
// Returns: red embed, title "Permission Removed and User Blocked",
//   description: "<@userId>'s **{roleName}** elevation was revoked and their PIM account
//                has been blocked by an administrator. Use `/watchtower-unlock` to
//                restore their access."

// ── Extend session ──────────────────────────────────────────────────────────

export function buildExtendedSessionEmbed(
  userId: string,
  roleName: string,
  newExpiresAt: Date
): EmbedBuilder;
// Returns: green embed, title "Session Extended",
//   description: "<@userId>, your **{roleName}** session has been extended
//                until <t:newUnix:R>."

// ── Generic audit log ───────────────────────────────────────────────────────

export function buildAuditLogEmbed(
  eventType: AuditEventType,     // imported from @prisma/client
  userId: string,
  timestamp: Date,
  roleName?: string
): EmbedBuilder;
// Returns: embed with colour derived from eventType, title "{emoji} {label}",
//   fields: User=<@userId>, Role=roleName (if present), When=<t:unix:R>
```

### Implementation Notes

1. Every builder calls `.setTimestamp()` at the end — Discord renders this as
   "Today at HH:MM" in the embed footer.
2. `buildAuditLogEmbed` uses the existing `eventTypeEmoji` function (imported from
   `audit.ts` or extracted to a shared helper) for the title prefix emoji.
3. A private `eventTypeColor` helper maps `AuditEventType` → hex colour constant:
   - Granted/unlocked/set events → GREEN
   - Warning/failed-attempt events → ORANGE
   - Revoked/locked/blocked events → RED
   - All others → GREY
4. All user mentions use `<@userId>` format only — never `<@!userId>` (the `!` form
   is deprecated in Discord API v10).
5. Embed field values must be non-empty strings. If `roleName` is absent, the "Role"
   field is omitted entirely (not set to `"undefined"` or `"N/A"`).
6. Discord embed limits:
   - Title: max 256 chars — role names are Discord-enforced to ≤100 chars; safe.
   - Description: max 4096 chars — all descriptions are short, templated strings; safe.
   - Field value: max 1024 chars — user IDs (18–19 digits) and role names are well
     within this limit.
   - Total character count: max 6000 — with at most 4 fields of short values, safe.

---

## Modified Files

### `src/lib/audit.ts`

**Change:** Replace `channel.send({ content: "..." })` with
`channel.send({ embeds: [buildAuditLogEmbed(...)] })`.

```typescript
// Before:
await channel.send(
  `${emoji} \`${params.eventType}\` — \`${params.discordUserId}\`${rolePart} — <t:${unix}:R>`
);

// After:
await channel.send({
  embeds: [buildAuditLogEmbed(params.eventType, params.discordUserId, log.createdAt, params.roleName)],
});
```

`skipChannelPost` logic, DB write, and error handling are unchanged.

### `src/commands/user/elevate.ts`

**Change (audit channel send):**
```typescript
// Before:
const auditMsg = await auditChannel.send({
  content: `⬆️ **PIM Elevation** — \`${discordUserId}\` has been granted ...`,
  components: [adminRow],
});

// After:
const auditMsg = await auditChannel.send({
  embeds: [buildElevationGrantedAuditEmbed(discordUserId, eligible.roleName, expiresAt)],
  components: [adminRow],
});
```

**Change (alert channel send):**
```typescript
// Before:
const alertMsg = await alertChannel.send({
  content: `⬆️ You have been granted **${eligible.roleName}** until <t:${expiryUnix}:R>.`,
  components: [alertRow],
});

// After:
const alertMsg = await alertChannel.send({
  embeds: [buildElevationGrantedAlertEmbed(discordUserId, eligible.roleName, expiresAt)],
  components: [alertRow],
});
```

All button logic, `auditMessageId`/`alertMessageId` storage, and error handling unchanged.

### `src/jobs/expireElevations.ts`

**Change (warning scan — alert channel):**
```typescript
// Before:
await alertChannel.send({
  content: `⏰ <@${elevation.pimUser.discordUserId}>, your **${elevation.roleName}** ...`,
  components: [row],
});

// After:
await alertChannel.send({
  embeds: [buildExpiryWarningAlertEmbed(
    elevation.pimUser.discordUserId,
    elevation.roleName,
    elevation.expiresAt
  )],
  components: [row],
});
```

**Change (warning scan — audit channel):**
```typescript
// Before:
await auditChannel.send(
  `⏰ **Expiry Warning** — \`${elevation.pimUser.discordUserId}\`'s ...`
);

// After:
await auditChannel.send({
  embeds: [buildExpiryWarningAuditEmbed(
    elevation.pimUser.discordUserId,
    elevation.roleName,
    elevation.expiresAt
  )],
});
```

**Change (expiry scan — message edits):**
Both `alertMsg.edit({ components: [] })` and `auditMsg.edit({ components: [] })` remain
exactly as-is. These calls only strip buttons from the message — the embed body is
preserved in place by Discord automatically when `embeds` is omitted from the edit call.
This is correct Discord API behaviour: omitting `embeds` from a `.edit()` payload leaves
the existing embeds unchanged.

No change to `skipChannelPost: true` on `writeAuditLog` in the warning scan.

### `src/lib/buttonHandlers.ts`

**Change (handleSelfRevoke — audit channel edit):**
```typescript
// Before:
await auditMsg.edit({
  content: `↩️ **Session Self-Revoked** — \`${...}\`'s **${...}** session ...`,
  components: [],
});

// After:
await auditMsg.edit({
  embeds: [buildSelfRevokedAuditEmbed(elevation.pimUser.discordUserId, elevation.roleName)],
  content: "",       // Clear old plain-text content
  components: [],
});
```

Note: `content: ""` must be set explicitly when editing a message that previously had
`content` set, to clear the old plain-text string. Discord will preserve existing
`content` if the field is omitted from the edit payload.

**Change (handleRemovePerm — audit channel edit):**
```typescript
// Before:
await interaction.message.edit({ components: [] });

// After:
await interaction.message.edit({
  embeds: [buildAdminRevokedAuditEmbed(elevation.pimUser.discordUserId, elevation.roleName)],
  content: "",
  components: [],
});
```

**Change (handleRemovePermBlock — audit channel edit):**
```typescript
// Before:
await interaction.message.edit({ components: [] });

// After:
await interaction.message.edit({
  embeds: [buildAdminRevokedBlockedAuditEmbed(elevation.pimUser.discordUserId, elevation.roleName)],
  content: "",
  components: [],
});
```

**Change (handleExtendSession — warning message edit):**
```typescript
// Before:
await interaction.message.edit({ components: [row] });  // row has disabled button

// After:
await interaction.message.edit({
  embeds: [buildExtendedSessionEmbed(elevation.pimUser.discordUserId, elevation.roleName, newExpiresAt)],
  content: "",
  components: [row],
});
```

**Alert channel edits in handleRemovePerm and handleRemovePermBlock:**
These are fetched-message edits (not `interaction.message`). They remain `{ components: [] }`
only. The original alert embed is preserved in-place — no embed replacement needed here
because the alert embed is still accurate (it showed the elevation when it was granted;
the button removal alone communicates the session is over).

---

## API Contracts

### `channel.send()` payload structure (after this change)

All channel sends use this pattern:
```typescript
await channel.send({
  embeds: [someBuilder],        // always present; content is absent
  components: [someActionRow],  // optional; only when buttons are needed
});
```

The `content` field is **never set** on channel-posted messages. This ensures zero pings.

### `message.edit()` payload structure (after this change)

- **Strip buttons only (expiry scan, alert channel on any session end):**
  ```typescript
  await msg.edit({ components: [] });
  // embeds and content are omitted — Discord preserves existing embed body
  ```

- **Replace embed + strip buttons (audit channel on session end):**
  ```typescript
  await msg.edit({
    embeds: [newEmbed],
    content: "",
    components: [],
  });
  // Explicitly clearing content prevents stale text from v1.0.0 messages
  // (pre-embed messages had plain-text content that would persist otherwise)
  ```

- **Replace embed + update button state (extend session):**
  ```typescript
  await msg.edit({
    embeds: [updatedEmbed],
    content: "",
    components: [disabledRow],
  });
  ```

---

## Database Schema

No changes required. `ActiveElevation.alertMessageId` and `ActiveElevation.auditMessageId`
continue to store Discord message IDs for all session-ending code paths to reach back and
update both messages.

---

## Security Considerations

1. **No new attack surface.** The change is entirely presentational — all auth checks,
   guild-isolation guards, and DB operations are unchanged.
2. **Content vs embed distinction.** Setting `content: ""` on edits and never setting
   `content` on sends ensures `<@userId>` appears only inside embed fields/descriptions,
   which do not trigger pings. If `content` accidentally contained a mention, it would
   ping. The architectural rule "never set `content` on channel posts" must be enforced
   in code review.
3. **Embed field injection.** All embed field values come from DB-stored data (role names,
   user IDs). Role names are Discord-native (set by server admins) and not user-controlled
   at the point of embed construction. No sanitization is needed beyond what Discord's
   own API enforces (field value length limits).

---

## Infrastructure

No infrastructure changes. No new dependencies. `EmbedBuilder` is already part of
`discord.js` v14 (already in `package.json` dependencies). Already used in `config.ts`.

---

## Migration Path for Existing Messages

Sessions active at deploy time will have their original plain-text messages in the
channels. When those sessions end:
- Expiry scan edits: `{ components: [] }` only — this works on plain-text messages
  too (strips buttons, preserves old content).
- Button-click edits (self-revoke, admin-revoke): these now supply `content: ""` and
  `embeds: [newEmbed]`, which will cleanly replace the old plain-text content and add
  the new embed. No data loss.

---

## Testing Strategy

All tests are source-level (file content inspection) plus pure logic unit tests — no
Discord API mocking needed. New test file `tests/embed-notifications.test.ts`:

1. `embeds.ts` — verify each exported function name exists; verify embed builder calls
   include correct colour constants and `<@userId>` mention format in description/field
   strings.
2. `elevate.ts` — verify `EmbedBuilder` is imported; verify `buildElevationGranted*`
   function calls are present.
3. `expireElevations.ts` — verify `EmbedBuilder` is imported; verify
   `buildExpiryWarning*` calls; verify `skipChannelPost: true` is unchanged.
4. `buttonHandlers.ts` — verify `buildSelfRevokedAuditEmbed`, `buildAdminRevoked*`
   calls are present; verify `content: ""` appears in edits; verify all existing
   security assertions still pass.
5. `audit.ts` — verify `buildAuditLogEmbed` call replaces the old `channel.send(...)`.

Existing 278 tests must continue to pass without modification (the existing tests check
for structural elements — function names, flag usage, `customId` prefixes — that are all
unchanged by this refactor).

---

## Versioning

This is a MINOR release (new feature, no schema breaking changes):
- Next version: `v1.1.0`
- CHANGELOG entry required before tagging
- Tag: `git tag v1.1.0` on `master` after staging confirmation
