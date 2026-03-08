# User Stories: Role Expiry Notifications

**Epic:** EPIC-003 — Role Expiry Notifications
**Date:** 2026-03-08
**Last Revised:** 2026-03-08 (v2 — DM approach replaced; interactive audit-channel buttons added)
**Status:** Approved

---

## Process Flow

### Current State

```
[Cron fires every minute]
  └─> EXPIRY SCAN:
        Query: ActiveElevation WHERE expiresAt <= now
          └─> For each expired elevation:
                ├─> Remove Discord role
                ├─> Delete ActiveElevation record
                └─> Write ELEVATION_EXPIRED audit log

[elevate.ts — on role selection]
  └─> Posts plain-text alert to alertChannelId (if set)
```

User experience: Role disappears with zero warning. Admins must run `/watchtower-revoke` manually to act on any elevation.

### Future State

```
[Cron fires every minute]
  ├─> WARNING SCAN (new):
  │     Query: ActiveElevation
  │       WHERE expiresAt <= (now + notifyBeforeMin)
  │         AND expiresAt >  now              (not yet expired)
  │         AND notifiedAt IS NULL            (not yet warned)
  │         AND guild.notifyBeforeMin > 0     (feature enabled)
  │       For each qualifying elevation:
  │         ├─> Post to auditChannelId: ping user + expiry timestamp + "Extend Session" button
  │         ├─> Write ELEVATION_EXPIRY_WARNING audit log
  │         └─> SET notifiedAt = now
  │
  └─> EXPIRY SCAN (existing, unchanged logic):
        Query: ActiveElevation WHERE expiresAt <= now
          └─> Remove role, delete record, write ELEVATION_EXPIRED audit log

[elevate.ts — on role selection, REVISED]
  └─> Posts to auditChannelId (preferred) or alertChannelId (fallback):
        Message includes "Remove Permission" + "Remove Permission and Block" buttons

[interactionCreate.ts — button routing (new)]
  ├─> customId prefix "extend_session:"  → extendSessionHandler()
  ├─> customId prefix "remove_perm:"     → removePermHandler()
  └─> customId prefix "remove_perm_block:" → removePermBlockHandler()
```

---

## Stories

---

### STORY-001: Warning message posted to audit channel with Extend Session button

**As a** user with an active PIM elevation,
**I want to** see a ping in the audit channel warning me that my elevation is expiring soon, with an option to extend it,
**so that** I can continue my work without being interrupted by a sudden permission loss.

#### Acceptance Criteria

- AC1: When an `ActiveElevation` satisfies `expiresAt <= now + notifyBeforeMin` AND `expiresAt > now` AND `notifiedAt IS NULL`, and the guild has `notifyBeforeMin > 0` and `auditChannelId` configured, the bot posts a warning message to that channel.
- AC2: The warning message pings the user directly (`<@userId>`), names the role, and shows a Discord relative expiry timestamp (`<t:UNIX:R>`).
- AC3: The message includes a single "Extend Session" button with `customId = "extend_session:<elevationId>"`.
- AC4: After posting (whether it succeeds or fails), `notifiedAt` is set to `now` on the `ActiveElevation` record.
- AC5: If posting to the audit channel fails (channel deleted, missing permissions), the failure is caught and logged non-fatally; `notifiedAt` is still set to prevent infinite retry.
- AC6: The warning fires at most once per elevation session (gate: `notifiedAt IS NULL`).
- AC7: If `notifyBeforeMin` is `0` for the guild, no warning is posted.
- AC8: If `auditChannelId` is null, no warning is posted (silently skipped — no crash).

#### Data Requirements

- `ActiveElevation.notifiedAt` (DateTime?, nullable) — new field
- `GuildConfig.notifyBeforeMin` (Int, default 5) — new field

#### Edge Cases

- `notifyBeforeMin` >= `sessionDurationMin`: warning fires once on first cron tick after elevation. Acceptable; documented.
- Cron tick coincides with session expiry (race): expiry scan deletes the record; warning scan finds nothing due to `expiresAt > now` filter. Safe.
- Elevation extended between warning and expiry: `notifiedAt` cleared on extension, so a second warning fires near the new expiry.

---

### STORY-002: "Extend Session" button resets the elevation timer

**As a** user who has been warned that my elevation is expiring,
**I want to** click "Extend Session" to reset my timer without re-authenticating,
**so that** I can continue my task without interruption.

#### Acceptance Criteria

- AC1: Clicking "Extend Session" triggers a button interaction routed via `interactionCreate.ts` by matching `customId` prefix `extend_session:`.
- AC2: The handler verifies `interaction.user.id === elevation.pimUser.discordUserId`. If the wrong user clicks, reply with an ephemeral error and return.
- AC3: The elevation's `expiresAt` is reset to `now + config.sessionDurationMin * 60 * 1000`.
- AC4: `notifiedAt` is set to `null` (cleared) so the warning can fire again near the new expiry.
- AC5: An `ELEVATION_EXTENDED` audit log entry is written with `roleId`, `roleName`, and `metadata: { newExpiresAt: ISO string }`.
- AC6: The bot replies ephemerally to the user confirming the new expiry time.
- AC7: If the elevation record no longer exists when the button is clicked (already expired), reply ephemerally with an informative error: "This elevation has already expired."
- AC8: The original warning message is updated (components removed or button disabled) after a successful extension to prevent re-clicking.

---

### STORY-003: Elevation-granted message includes admin action buttons

**As a** Watchtower admin monitoring the audit channel,
**I want** the elevation-granted notification to include "Remove Permission" and "Remove Permission and Block" buttons,
**so that** I can act immediately without running a separate command.

#### Acceptance Criteria

- AC1: When an elevation is granted, the bot posts a message to `auditChannelId` (if configured) that includes the user mention, role name, expiry timestamp, and two buttons.
- AC2: Button 1: label "Remove Permission", `customId = "remove_perm:<elevationId>"`, style Danger.
- AC3: Button 2: label "Remove Permission and Block", `customId = "remove_perm_block:<elevationId>"`, style Danger.
- AC4: If `auditChannelId` is null, fall back to `alertChannelId` for the plain message (no buttons possible on fallback — post plain text only). If neither is set, skip silently.
- AC5: If the message fails to post, catch and log non-fatally.

---

### STORY-004: "Remove Permission" button immediately revokes the elevation

**As a** Watchtower admin,
**I want to** click "Remove Permission" in the audit channel to immediately revoke a user's elevation,
**so that** I can act faster than running `/watchtower-revoke`.

#### Acceptance Criteria

- AC1: Clicking "Remove Permission" triggers handler via `customId` prefix `remove_perm:`.
- AC2: Handler calls `isWatchtowerAdmin(member, config)`. If the caller is not an admin, reply ephemerally with an access-denied error and return.
- AC3: The bot removes the Discord role from the member.
- AC4: The `ActiveElevation` record is deleted.
- AC5: An `ELEVATION_ADMIN_REVOKED` audit log entry is written with `roleId`, `roleName`, `discordUserId` of the elevated user, and `metadata: { revokedBy: adminDiscordUserId, isWatchtowerAdmin: true }`.
- AC6: The bot replies ephemerally to the admin confirming the action.
- AC7: If the elevation record no longer exists (already expired or already revoked), reply ephemerally: "This elevation has already ended."
- AC8: The original audit channel message is updated (buttons disabled/removed) after the action.

---

### STORY-005: "Remove Permission and Block" button revokes and blocks the user

**As a** Watchtower admin,
**I want to** click "Remove Permission and Block" to revoke an elevation and prevent the user from elevating again until manually unblocked,
**so that** I can respond to a security concern in one action.

#### Acceptance Criteria

- AC1: Clicking "Remove Permission and Block" triggers handler via `customId` prefix `remove_perm_block:`.
- AC2: Handler calls `isWatchtowerAdmin(member, config)`. Unauthorized caller receives ephemeral error.
- AC3: The bot removes the Discord role from the member.
- AC4: The `ActiveElevation` record is deleted.
- AC5: `PimUser.blockedAt` is set to `now`.
- AC6: An `ELEVATION_ADMIN_REVOKED_BLOCKED` audit log entry is written with `metadata: { revokedBy: adminDiscordUserId, isWatchtowerAdmin: true }`.
- AC7: An `ELEVATION_BLOCKED` audit log entry is written for the blocked user.
- AC8: The bot replies ephemerally to the admin confirming both the revocation and the block.
- AC9: If the elevation record no longer exists, reply ephemerally: "This elevation has already ended."
- AC10: The original audit channel message is updated (buttons disabled/removed) after the action.

---

### STORY-006: Blocked users cannot elevate; /watchtower-unlock clears the block

**As a** Watchtower admin,
**I want** blocked users to be prevented from elevating, and `/watchtower-unlock` to clear the block,
**so that** the block mechanism integrates cleanly with existing account management.

#### Acceptance Criteria

- AC1: `/elevate` checks `pimUser.blockedAt` immediately after the `lockedAt` check. If set, return an ephemeral error: "Your PIM account has been blocked by an administrator. Contact a Watchtower Admin."
- AC2: `/watchtower-unlock` clears `blockedAt` (set to `null`) in addition to clearing `lockedAt` and resetting `failedAttempts`.
- AC3: `/watchtower-unlock` succeeds even if only `blockedAt` is set and `lockedAt` is null — the command checks if either is set before requiring a target to be locked.
- AC4: The unlock audit log metadata includes `clearedBlock: true` when `blockedAt` was non-null at time of unlock.

---

### STORY-007: Admin configures warning lead time via /watchtower-config

**As a** Watchtower admin,
**I want to** configure how many minutes before expiry the warning is sent,
**so that** I can tune the system to match my server's workflow needs.

#### Acceptance Criteria

- AC1: `/watchtower-config` gains a new `notify-before` integer option (min: 0, max: 60).
- AC2: Setting `notify-before: 0` disables all expiry warning messages for the guild.
- AC3: The current `notifyBeforeMin` value is shown in the `/watchtower-config` view embed.
- AC4: Updating `notify-before` is gated by `isWatchtowerAdmin()` (no change to existing gate).
- AC5: The `help.ts` embed is updated to document the `notify-before` option under Admin Commands.

#### Edge Cases

- Admin sets `notify-before` greater than `session-duration`: the reply includes a caution note: "Note: notify-before (N min) exceeds session-duration (M min). The warning will fire on the first cron tick after every elevation."

---

### STORY-008: Database migration adds all new fields

**As a** developer,
**I want** a single Prisma migration that adds all three new fields,
**so that** the new feature has the required schema without data loss.

#### Acceptance Criteria

- AC1: Migration SQL uses camelCase column names: `"notifyBeforeMin"`, `"notifiedAt"`, `"blockedAt"`.
- AC2: `"notifyBeforeMin"` in `guild_configs`: `INTEGER NOT NULL DEFAULT 5`.
- AC3: `"notifiedAt"` in `active_elevations`: nullable, no default.
- AC4: `"blockedAt"` in `pim_users`: nullable, no default.
- AC5: Migration runs via `prisma migrate deploy` with no data loss.
- AC6: `schema.prisma` updated to reflect all three fields.
- AC7: New `AuditEventType` enum values added: `ELEVATION_EXPIRY_WARNING`, `ELEVATION_EXTENDED`, `ELEVATION_ADMIN_REVOKED`, `ELEVATION_ADMIN_REVOKED_BLOCKED`, `ELEVATION_BLOCKED`.

---

## Priority Order

| Story | Priority | Rationale |
|---|---|---|
| STORY-008 | P0 — Schema first | All stories depend on it |
| STORY-001 | P1 — Core UX | Warning message + idempotency |
| STORY-002 | P1 — Core UX | Extend Session button |
| STORY-003 | P1 — Admin control | Elevation-granted buttons |
| STORY-004 | P1 — Admin control | Remove Permission handler |
| STORY-005 | P1 — Admin control | Remove Permission and Block handler |
| STORY-006 | P2 — Safety gate | Block enforcement + unlock update |
| STORY-007 | P2 — Configuration | Config command + help update |
