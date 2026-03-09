# Changelog

All notable changes to Discord Watchtower will be documented in this file.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [Unreleased]

---

## [1.0.0] — 2026-03-09

This is the first stable production release of Discord Watchtower. The core PIM flow, admin tooling, audit infrastructure, and operational hardening features have been developed and validated across the v0.0.x–v0.4.x series. v1.0.0 represents the point at which the feature set is considered complete and production-ready for multi-guild deployment.

### Added

- **Graceful shutdown** (`src/index.ts`, `src/jobs/expireElevations.ts`) — the bot now handles `SIGTERM` and `SIGINT` cleanly. On signal receipt the cron job is stopped, the Prisma client disconnects from PostgreSQL, and the Discord client is destroyed before `process.exit(0)`. A double-signal guard (`isShuttingDown`) prevents any of these steps from running twice if a second signal arrives before shutdown completes. This is the standard behaviour expected by Docker / Portainer during container stop or redeploy.

- **Rate limiting on `/elevate`** (`src/commands/user/elevate.ts`) — a per-user, per-guild sliding-window rate limiter now gates the `/elevate` command. At most 3 invocations are allowed within any rolling 60-second window. Users who exceed the limit receive an ephemeral "slow down" reply; no audit log entry is written for the rejected attempt. The cooldown is tracked in-memory, keyed on `${guildId}:${userId}` to ensure full multi-guild isolation. This is distinct from the existing brute-force lockout mechanism — it protects the password-verification path from rapid-fire command spam without affecting the lockout counter.

- **Bulk eligibility assignment** (`src/commands/admin/assign.ts`) — `/watchtower-assign` now accepts up to three roles in a single invocation (`role1` required, `role2` and `role3` optional). Each role is processed independently and idempotently: already-assigned roles are reported as "already assigned (no change)" without emitting a duplicate audit event; roles at or above the bot in the hierarchy or matching the configured Watchtower Admin role are reported as "skipped" with a reason. The reply lists per-role outcomes and a contextual footer. Passing the same role twice in a single invocation is handled (deduped before processing).

- **`/watchtower-list` — Active Elevations section** (`src/commands/admin/list.ts`) — the list embed now includes a second section showing all currently active elevations for the server (or for a specific user when the `user:` filter is applied). Each entry shows the role name, the elevated user mention, and the expiry time as a relative Discord timestamp (`<t:...:R>`). Field budget: 20 fields for assignments, 5 for active elevations (total 25 — at Discord's embed field cap). Truncation is noted in the embed footer when limits are hit.

- **`/watchtower-audit` command** (`src/commands/admin/audit.ts`) — new admin command for querying the PIM audit log directly from Discord, without needing database access.
  - `/watchtower-audit user:@user [limit:N]` — shows the N most recent audit log entries for a specific user (default 10, max 25).
  - `/watchtower-audit recent [limit:N]` — shows the N most recent entries across the entire server (default 10, max 25).
  - Results are rendered as a Discord embed with per-entry fields showing the event type emoji, event name, timestamp, role (when applicable), and metadata summary.
  - A 5500-character embed budget guard truncates the field list before the Discord 6000-character limit is hit; a footer note is shown when truncation occurs.
  - Gated by `isWatchtowerAdmin()`. Guild-scoped queries only. No new DB schema required — reads from the existing `AuditLog` table.

### Changed

- **`/watchtower-assign` command description and options updated** — the command description now reads "Assign role eligibility to a user (up to 3 roles at once)" and the `role` option has been renamed to `role1` (required). `role2` and `role3` are new optional options. Existing single-role usage (`/watchtower-assign user:@u role1:@r`) works identically to before.

- **`startExpiryJob` now returns `ScheduledTask`** (`src/jobs/expireElevations.ts`) — previously the job was fire-and-forget with no handle. The return value is now used by the shutdown handler to call `.stop()` before process exit, ensuring in-flight cron callbacks are not interrupted mid-execution.

- **`eventTypeEmoji` promoted to named export** (`src/lib/audit.ts`) — was previously a module-private function. Now exported so `audit.ts` can reuse it without duplicating the emoji map.

- **`/help` updated** — `/watchtower-audit` listed in Admin Commands with both subcommands described. `/watchtower-assign` description updated to reflect 3-role capability.

### Fixed

- Rate-limit cooldown map entries are automatically evicted for users whose timestamps have all expired, keeping the map bounded across long process uptime.

### Migration

No database migrations. All five features reuse the existing schema (`AuditLog`, `ActiveElevation`, `EligibleRole`, `PimUser`, `GuildConfig`) without any structural changes.

### Discord Command Registration

`/watchtower-audit` is a new global slash command. After deploying v1.0.0, global command propagation takes up to 1 hour. During this window the command may not appear in the Discord UI autocomplete; once propagated it is immediately usable. No manual registration step is needed — the bot re-registers all commands automatically on startup via the `ready` event.

The `/watchtower-assign` option rename (`role` → `role1`) is a non-breaking Discord API change. The original `role` option will disappear from the UI after propagation; no existing slash command invocations are affected because the command must be re-invoked interactively.

---

## [0.3.0] — 2026-03-09

### Added
- **"Revoke Early" button in alert channel** — when a role is granted, the alert channel message now includes a **Revoke Early** button. Only the elevated user themselves can click it. Clicking ends the session immediately (removes the Discord role, deletes the `ActiveElevation` record) without touching the user's password, eligible roles, or any other account state.
- **`ELEVATION_SELF_REVOKED` audit event** — new `AuditEventType` value written when a user self-revokes. Metadata is minimal (no admin involved).
- **`alertMessageId` / `auditMessageId` on `ActiveElevation`** — two new nullable `String?` columns. After elevation is granted both channel message IDs are stored so any session-ending path can reach back and clean up the messages.
- **`self_revoke:` button routing** — new branch in `interactionCreate.ts` routes the self-revoke button to `handleSelfRevoke` in `buttonHandlers.ts`. Checked before `remove_perm_block:` to avoid any future prefix ambiguity.
- **Bare-integer duration default (minutes)** — `parseDuration` now treats a plain integer with no unit suffix as minutes (e.g. `"30"` → 1800 s). The `"0"` disable-case is still handled first (unchanged).

### Changed
- **Buttons removed on session end** — all session-ending paths (self-revoke, admin-revoke via button, natural expiry) now edit both the alert and audit channel messages with `components: []`, removing all buttons entirely. Previously they were greyed-out disabled buttons, which caused user confusion about their account state.
- **Audit message content updated on self-revoke** — when a user self-revokes, the audit channel message content is updated to "Session Self-Revoked — @user's **Role** session was ended early by the user. Role removed; eligibility intact." This prevents admins from accidentally running `/watchtower-revoke` thinking manual cleanup is required.
- `_buildDisabledAlertRow` and `_buildDisabledAdminRow` helpers removed from `buttonHandlers.ts` (no longer needed).
- `/watchtower-config` `session-duration` and `notify-before` option descriptions updated to mention that bare integers are treated as minutes.

### Fixed
- Alert channel message no longer shows a greyed-out "Revoked" or "Expired" button after a session ends — button is fully removed.
- Audit channel message no longer shows greyed-out "Remove Permission" buttons after a session ends — buttons fully removed.

### Migration
- `prisma/migrations/20260309000001_add_elevation_self_revoked_event/migration.sql` — additive only:
  - `ALTER TYPE "AuditEventType" ADD VALUE 'ELEVATION_SELF_REVOKED'`
- `prisma/migrations/20260309000002_add_elevation_message_ids/migration.sql` — additive only:
  - `"alertMessageId" TEXT` (nullable) on `active_elevations`
  - `"auditMessageId" TEXT` (nullable) on `active_elevations`

---

## [0.2.0] — 2026-03-09

### Added
- **`/watchtower-reset-password user:@user`** — new admin command. Clears a user's PIM password hash (sets it to `NULL`), simultaneously clears `lockedAt`, `blockedAt`, and resets `failedAttempts` to 0. Requires the Watchtower Admin role. The target user must run `/set-password` before they can elevate again. Their eligible role assignments are preserved.
- **`PASSWORD_RESET` audit event** — new `AuditEventType` value written to the `audit_logs` table on every successful password reset. Metadata includes `resetBy` (admin Discord user ID) and `isWatchtowerAdmin: true`. The event is echoed to the configured audit channel.
- **Null-password guard in `/elevate`** — when `PimUser.passwordHash` is `NULL`, `/elevate` returns a clear ephemeral error instructing the user to run `/set-password`. Fires after the `lockedAt` and `blockedAt` checks, before `verifyPassword`. No `FAILED_ATTEMPT` is recorded.
- **`/help` updated** — `/watchtower-reset-password` listed in the Admin Commands section.

### Changed
- `PimUser.passwordHash` is now nullable (`String?`). Existing non-null hashes are unaffected. The `NULL` state is the sentinel for "password cleared by admin".

### Migration
- `prisma/migrations/20260309000000_nullable_password_hash/migration.sql` — additive only:
  - `ALTER TABLE "pim_users" ALTER COLUMN "passwordHash" DROP NOT NULL` — allows `NULL`; no existing data modified
  - `ALTER TYPE "AuditEventType" ADD VALUE 'PASSWORD_RESET'`

---

## [0.1.0] — 2026-03-08

### Added
- **Role expiry notifications** — the expiry cron job now runs a warning scan each minute. When a session is within the configured warning window (`notifyBeforeMin`, default 5 min), the bot posts a message to the audit channel pinging the user with an **Extend Session** button. Clicking it resets `expiresAt` to a full new session and clears `notifiedAt` so the warning fires again near the new expiry.
- **Elevation-granted message with admin action buttons** — when a role is granted, the bot posts to the audit channel (preferred) or alert channel (fallback) with two admin-only buttons: **Remove Permission** (immediately revokes the elevation) and **Remove Permission and Block** (revokes and sets `PimUser.blockedAt`, preventing future elevations until unblocked).
- **`/watchtower-config notify-before`** — new integer option (0–60 min) to configure how many minutes before expiry the warning fires. Setting to `0` disables notifications. Default is 5. The config embed now shows an "Expiry Warning" field. A caution note is shown when `notify-before` exceeds `session-duration`.
- **`PimUser.blockedAt`** — new nullable field. Set by the "Remove Permission and Block" button. Prevents `/elevate` from proceeding; cleared by `/watchtower-unlock`.
- **`/watchtower-unlock` now clears `blockedAt`** in addition to `lockedAt` and `failedAttempts`. The command succeeds when either or both locks are set. Reply note indicates when a block was also cleared. Audit log metadata includes `clearedBlock: true` when applicable.
- **`src/lib/buttonHandlers.ts`** — new module containing all three button interaction handlers (`handleExtendSession`, `handleRemovePerm`, `handleRemovePermBlock`). Each handler re-fetches the elevation from DB, re-validates auth server-side, performs the action, writes an audit log, disables the button on the original message, and replies ephemerally.
- **Button routing in `interactionCreate.ts`** — new `isButton()` branch routes `extend_session:`, `remove_perm_block:`, and `remove_perm:` prefixes to their handlers. `remove_perm_block:` is checked before `remove_perm:` to prevent prefix collision.
- **Five new `AuditEventType` values**: `ELEVATION_EXPIRY_WARNING`, `ELEVATION_EXTENDED`, `ELEVATION_ADMIN_REVOKED`, `ELEVATION_ADMIN_REVOKED_BLOCKED`, `ELEVATION_BLOCKED`.
- **`writeAuditLog` `skipChannelPost` option** — new optional field on `AuditParams`. When `true`, suppresses the plain-text audit channel echo so callers that have already posted an interactive message do not produce a duplicate line. Used by `elevate.ts` (ELEVATION_GRANTED) and `expireElevations.ts` (ELEVATION_EXPIRY_WARNING).

### Changed
- `/watchtower-config` embed updated: "Expiry Warning" field added between "Session Duration" and "Lockout Threshold". Audit channel description updated to note it hosts interactive alerts.
- `/watchtower-unlock` command description updated to reflect that it also clears admin blocks.
- `/help` embed updated: `/watchtower-unlock` description updated; `/watchtower-config` description updated to mention expiry warning timing.
- `expireElevations.ts` refactored: cron callback now calls `runWarningScan()` then `runExpiryScan()` as separate named functions.

### Migration
- `prisma/migrations/20260308000001_add_expiry_notifications/migration.sql` — additive only:
  - `"notifyBeforeMin" INTEGER NOT NULL DEFAULT 5` on `guild_configs`
  - `"notifiedAt" TIMESTAMP(3)` (nullable) on `active_elevations`
  - `"blockedAt" TIMESTAMP(3)` (nullable) on `pim_users`
  - Five new `AuditEventType` enum values via `ALTER TYPE ADD VALUE`

---

## [0.0.3] — 2026-03-08

### Fixed
- Admin commands now have no `setDefaultMemberPermissions` call — they are visible to all users in the Discord UI, and `isWatchtowerAdmin()` is the sole runtime gate. Previously, commands were incorrectly hidden from the UI for non-Administrators, making the bot appear broken to legitimate Watchtower Admin role holders.
- Removed a stale `PermissionFlagsBits` import from all five admin command files left over from the `setDefaultMemberPermissions` removal.
- Fixed a TypeScript type error in `interactionCreate.ts` introduced when adding the `client` parameter to command `execute()` signatures.
- Moved `prisma` CLI from `devDependencies` to `dependencies` so that `prisma migrate deploy` runs correctly in the Docker runner stage (which strips dev deps via `npm ci --omit=dev`).

---

## [0.0.2] — 2026-03-08

### Fixed
- Migration `20260308000000_add_admin_role_id_to_guild_config` used `"admin_role_id"` (snake_case) for the new column, but the project's DB convention (set by the init migration) is camelCase. Prisma expected `"adminRoleId"`, causing a `P2022` crash on every command after deployment. Corrected to `"adminRoleId"`.
- Replaced deprecated `ephemeral: true` interaction option with `flags: MessageFlags.Ephemeral` across all 10 call sites (8 command files + `interactionCreate.ts`). Eliminates the `DeprecationWarning` logged on every interaction.

---

## [0.0.1] — 2026-03-08

Initial public release. Core PIM flow, help command, and decoupled bot management permissions.

### Added
- Core PIM flow: `/set-password`, `/elevate` with role selection menu, automatic session expiry via cron job
- Admin commands: `/watchtower-assign`, `/watchtower-revoke`, `/watchtower-list`, `/watchtower-unlock`, `/watchtower-config`
- `/help` slash command — ephemeral embed listing all commands grouped by audience with a Getting Started guide
- `src/lib/permissions.ts` — `isWatchtowerAdmin(member, config)` helper with bootstrap fallback to Discord `Administrator`
- `GuildConfig.adminRoleId` — configurable Watchtower Admin role; null = bootstrap mode (Administrator fallback)
- `/watchtower-config admin-role:@role` option to designate the Watchtower Admin role
- `AuditEventType.ADMIN_ROLE_CONFIGURED` audit event
- Immutable audit log written to DB and optionally posted to a Discord channel
- Per-guild configuration: session duration, lockout threshold, alert channel, audit channel
- bcrypt password hashing (12 rounds) with Zod complexity validation
- Account lockout after configurable N failed attempts; `/watchtower-unlock` to recover
- Jest test suite (75 tests across `permissions.test.ts`, `admin-guard.test.ts`, `help-command.test.ts`)
- Docker + Docker Compose setup; Portainer GitOps deployment support
- Automatic global slash command registration on bot startup via `ready` event

### Security
- Runtime `isWatchtowerAdmin()` guard on all five admin commands — `Manage Roles` alone is insufficient
- Elevated users cannot inherit bot management access through the elevation flow
- Watchtower Admin role is filtered from the `/elevate` role selection menu
- Audit log enriched with `isWatchtowerAdmin` flag on every admin action
