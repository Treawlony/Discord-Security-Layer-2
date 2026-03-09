# User Stories: Discord Embed Notification System (EPIC-006)

---

## Process Flow

### Current State
All channel-posted messages are plain-text strings sent via `channel.send({ content: "..." })`.
User IDs appear as backtick-escaped strings (`` `123456789` ``) because `<@userId>` in
plain text triggers a notification ping.

```
Audit channel (plain text):
  ⬆️ `ELEVATION_GRANTED` — `123456789` | Role: **Moderator** — <t:1234567890:R>

Alert channel (plain text):
  ⬆️ You have been granted **Moderator** until <t:1234567890:R>.
```

### Future State
All channel-posted messages are Discord embeds sent via `channel.send({ embeds: [...] })`.
User IDs appear as `<@userId>` inside embed fields/descriptions (renders as clickable
link, no ping). Buttons remain attached to the same message via `components`.

```
Audit channel (embed):
  [Green embed]
  Title: "PIM Elevation Granted"
  Fields:
    User: <@123456789>
    Role: Moderator
    Expires: <t:1234567890:R>
  [Remove Permission] [Remove Permission and Block]

Alert channel (embed):
  [Green embed]
  Title: "Role Elevated"
  Description: <@123456789>, you have been granted **Moderator** until <t:1234567890:R>.
  [Revoke Early]
```

---

## Story 1 — Shared Embed Builder Utility

**As a** developer,
**I want** a centralized `src/lib/embeds.ts` module with typed embed-builder functions,
**so that** all channel-posted messages share a consistent visual style and construction
logic is not duplicated across files.

### Acceptance Criteria
1. File `src/lib/embeds.ts` is created.
2. Module exports named builder functions (one per message type) that return
   `EmbedBuilder` instances from discord.js v14.
3. Each builder accepts the minimum parameters needed (userId, roleName, expiresAt, etc.)
   and includes `<@userId>` in description or a field — NOT as a plain user ID string.
4. A consistent colour scheme is applied:
   - Green (`0x57F287`) for granted/active events
   - Orange (`0xFEE75C`) for warnings/expiry
   - Red (`0xED4245`) for revocations/blocks
   - Grey (`0x95A5A6`) for neutral/info events
5. Each embed includes a timestamp (Discord embed footer timestamp) set to `new Date()`.
6. All builder functions are pure (no side effects, no I/O).

### Data Requirements
- `buildElevationGrantedAuditEmbed(userId, roleName, expiresAt)` → green embed
- `buildElevationGrantedAlertEmbed(userId, roleName, expiresAt)` → green embed
- `buildExpiryWarningAlertEmbed(userId, roleName, expiresAt)` → orange embed
- `buildExpiryWarningAuditEmbed(userId, roleName, expiresAt)` → orange embed
- `buildElevationExpiredAuditEmbed(userId, roleName)` → grey embed (for audit.ts default post)
- `buildSelfRevokedAuditEmbed(userId, roleName)` → grey embed
- `buildAuditLogEmbed(eventType, userId, roleName?, timestamp)` → generic audit embed
  (used by the default `writeAuditLog` channel post path)
- `buildExtendedSessionEmbed(userId, roleName, newExpiresAt)` → green embed (for
  extend_session warning message edit)

### Edge Cases
- `roleName` may contain special characters — must be escaped or passed verbatim (Discord
  markdown in embed fields is supported).
- `expiresAt` should render as a Discord timestamp: `<t:${unix}:R>`.
- Embeds must not exceed Discord's 6000-character total limit or 256-character title limit.

---

## Story 2 — Audit Log Default Channel Post → Embed

**As a** guild admin,
**I want** the default `writeAuditLog` channel post to appear as a structured embed,
**so that** I can scan audit events quickly and click user mentions without being pinged.

### Acceptance Criteria
1. `src/lib/audit.ts`: the `channel.send()` call in `writeAuditLog` sends
   `{ embeds: [buildAuditLogEmbed(...)] }` instead of `{ content: "..." }`.
2. The embed includes:
   - Title: event-type label (e.g. "Failed Attempt", "Account Locked")
   - User field: `<@userId>` mention
   - Role field (if `roleName` is present): role name
   - Timestamp field: `<t:unix:R>` relative timestamp
   - Colour: mapped from `AuditEventType` (green for grants, red for revokes/blocks,
     orange for warnings, grey for info)
3. The existing `eventTypeEmoji` function is still used for the embed title prefix.
4. `skipChannelPost` logic is unchanged.
5. All existing audit.ts source-level tests continue to pass.

### Edge Cases
- If the channel fetch fails, the error is caught (non-fatal) as before.
- If `roleName` is absent, the role field is omitted entirely (not shown as "undefined").

---

## Story 3 — Elevation Granted Messages → Embed

**As a** guild admin (audit channel) and user (alert channel),
**I want** the elevation-granted messages to appear as green embeds with a user mention,
**so that** I can see who was elevated and click through to their profile without noise.

### Acceptance Criteria
1. `src/commands/user/elevate.ts`: the audit channel send uses
   `{ embeds: [buildElevationGrantedAuditEmbed(...)], components: [adminRow] }`.
2. The audit embed includes:
   - Title: "PIM Elevation Granted"
   - User field: `<@userId>`
   - Role field: role name
   - Expires field: `<t:unix:R>`
   - Colour: green
3. The alert channel send uses
   `{ embeds: [buildElevationGrantedAlertEmbed(...)], components: [alertRow] }`.
4. The alert embed includes:
   - Title: "Role Elevated"
   - Description: `<@userId>, you have been granted **{roleName}** until <t:unix:R>.`
   - Colour: green
5. Buttons (Remove Permission, Remove Permission and Block, Revoke Early) remain
   functional and attached to the respective embed messages.
6. `auditMessageId` and `alertMessageId` are still stored on the `ActiveElevation` record.
7. The ephemeral reply to the user (private, not a channel post) is unchanged.

### Edge Cases
- If `auditChannelId` is not configured, skip that block (unchanged behaviour).
- If `alertChannelId` is not configured, skip that block (unchanged behaviour).
- If the channel send fails, error is caught and logged (non-fatal).

---

## Story 4 — Expiry Warning Messages → Embed

**As a** user (alert channel) and admin (audit channel),
**I want** the expiry warning messages to appear as orange embeds with a user mention,
**so that** I am visually alerted to the approaching expiry without receiving a ping.

### Acceptance Criteria
1. `src/jobs/expireElevations.ts` warning scan: alert channel send uses
   `{ embeds: [buildExpiryWarningAlertEmbed(...)], components: [row] }`.
2. The alert embed includes:
   - Title: "Session Expiring Soon"
   - Description: `<@userId>, your **{roleName}** elevation expires <t:unix:R>. Click **Extend Session** to reset your timer.`
   - Colour: orange
3. Audit channel send uses
   `{ embeds: [buildExpiryWarningAuditEmbed(...)], content: undefined }`.
4. The audit embed includes:
   - Title: "Expiry Warning"
   - User field: `<@userId>`
   - Role field: role name
   - Expires field: `<t:unix:R>`
   - Colour: orange
5. The "Extend Session" button remains attached to the alert embed message.
6. `skipChannelPost: true` on `writeAuditLog` is unchanged (no duplicate plain-text echo).

### Edge Cases
- The `notifiedAt` is set before channel posts (unchanged — prevents retry spam on failure).
- If either channel fails, only that channel's post is skipped; the other proceeds.

---

## Story 5 — Session-End Message Edits → Embed

**As a** guild admin,
**I want** the audit channel message to be updated to a descriptive embed when a session
ends (self-revoke, admin-revoke, natural expiry),
**so that** I can see the final state of each session without buttons remaining active.

### Acceptance Criteria

#### 5a — Self-Revoke (handleSelfRevoke)
1. `src/lib/buttonHandlers.ts` `handleSelfRevoke`: audit channel message edit uses
   `{ embeds: [buildSelfRevokedAuditEmbed(...)], components: [] }`.
2. The embed includes:
   - Title: "Session Self-Revoked"
   - Description: `<@userId>'s **{roleName}** session was ended early by the user. Role removed; eligibility intact.`
   - Colour: grey
3. Alert channel message edit remains `{ components: [] }` with embed preserved
   (button removed, embed content unchanged).
4. The existing test assertion `"Session Self-Revoked"` and `"eligibility intact"`
   continue to pass (now checked in embed description, not `content`).

#### 5b — Admin Revoke (handleRemovePerm)
1. Audit channel message edit (the original elevation-granted embed) uses
   `{ embeds: [updated embed showing revoked state], components: [] }`.
2. The updated embed replaces the original with a red "Permission Removed" embed showing
   `<@userId>`, role name, and who revoked it.
3. Alert channel message edit: `{ components: [] }` (button removed, embed unchanged).

#### 5c — Admin Revoke + Block (handleRemovePermBlock)
1. Same as 5b but embed title is "Permission Removed and User Blocked".
2. Embed colour: red.
3. Embed description notes the user is blocked and must run `/watchtower-unlock`.

#### 5d — Natural Expiry (runExpiryScan)
1. Both alert and audit channel message edits remain `{ components: [] }` — the embed
   body is preserved as-is, only buttons are removed.
2. No new embed is constructed for the edit (edit only strips components, leaving the
   original elevation-granted embed visible as the historical record).
3. Existing test assertions about `components: []` continue to pass.

### Edge Cases
- Message edits are wrapped in try/catch (non-fatal if message deleted).
- When editing the audit message with a new embed, both `embeds` and `components` must
  be set in the same `.edit()` call.
- For the extend-session button message edit: update the existing warning embed to show
  "Session Extended" state (green, new expiry time) with the disabled button.

---

## Story 6 — Extend Session Warning Message Edit → Embed

**As a** user,
**I want** the expiry warning message to update to a "Session Extended" state when I
click Extend Session,
**so that** I can confirm my session was extended without the button remaining active.

### Acceptance Criteria
1. `src/lib/buttonHandlers.ts` `handleExtendSession`: the warning message edit uses
   `{ embeds: [buildExtendedSessionEmbed(...)], components: [disabledRow] }`.
2. The embed includes:
   - Title: "Session Extended"
   - Description: `<@userId>, your **{roleName}** session has been extended until <t:newUnix:R>.`
   - Colour: green
3. The disabled "Session Extended" button remains visible (unchanged).
4. The ephemeral reply to the user is unchanged.

### Edge Cases
- If the warning message was deleted before the click, the edit try/catch handles it
  gracefully (non-fatal).

---

## Story 7 — Test Coverage for Embeds

**As a** developer,
**I want** automated tests that verify embed structure in each key code path,
**so that** regressions in the notification format are caught in CI.

### Acceptance Criteria
1. A new test file `tests/embed-notifications.test.ts` is created.
2. Tests cover:
   - `src/lib/embeds.ts`: each builder returns an object with the expected title,
     colour, and field/description content (source-level and/or unit tests).
   - `src/lib/audit.ts`: still contains `skipChannelPost?` and `!params.skipChannelPost`.
   - `src/commands/user/elevate.ts`: uses `EmbedBuilder` and includes `remove_perm:` /
     `remove_perm_block:` button customIds.
   - `src/jobs/expireElevations.ts`: uses `EmbedBuilder`, still writes
     `ELEVATION_EXPIRY_WARNING`, still sets `skipChannelPost: true`.
   - `src/lib/buttonHandlers.ts`: self-revoke still contains "Session Self-Revoked" and
     "eligibility intact"; all handlers still `deferReply` with `MessageFlags.Ephemeral`.
3. All 278 existing tests continue to pass.
4. Test count increases by at least 15 new assertions.

---

## Summary Table

| Story | File(s) Touched | Complexity |
|---|---|---|
| 1 — Embed Builder Utility | `src/lib/embeds.ts` (new) | Medium |
| 2 — Audit Log Default Post | `src/lib/audit.ts` | Low |
| 3 — Elevation Granted | `src/commands/user/elevate.ts` | Low |
| 4 — Expiry Warning | `src/jobs/expireElevations.ts` | Low |
| 5 — Session-End Edits | `src/lib/buttonHandlers.ts` | Medium |
| 6 — Extend Session Edit | `src/lib/buttonHandlers.ts` | Low |
| 7 — Test Coverage | `tests/embed-notifications.test.ts` (new) | Medium |
