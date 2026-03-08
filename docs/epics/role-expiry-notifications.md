# Epic: Role Expiry Notifications

**Epic ID:** EPIC-003
**Feature Name:** role-expiry-notifications
**Date:** 2026-03-08
**Last Revised:** 2026-03-08 (v2 — DM approach replaced with audit-channel interactive buttons)
**Version Target:** 0.1.0 (MINOR — new config fields, new DB columns, new cron behaviour, new button interactions)
**Priority:** High

---

## Business Value

Users currently receive no warning before their PIM elevation expires. When the expiry cron job fires, their elevated role is silently removed — often mid-task — causing workflow disruption, confusion, and potential re-elevation noise.

Admins currently receive a plain-text elevation-granted alert but have no in-channel controls: revoking an elevation requires running `/watchtower-revoke` manually.

This epic addresses both problems with a single interactive model centred on the **audit log channel**:

1. **User experience**: A warning message pings the user in the audit channel N minutes before expiry and presents an "Extend Session" button. Clicking it resets the timer without requiring a new `/elevate` + password.
2. **Admin control**: The elevation-granted message in the audit channel gains "Remove Permission" and "Remove Permission and Block" buttons so admins can act in one click without leaving the channel.
3. **Operational visibility**: All actions (warning sent, session extended, admin revoke, admin block) are recorded in the immutable audit log.

---

## Success Metrics

| Metric | Target |
|---|---|
| Warning message posted to audit channel N min before expiry | 100% of active elevations where audit channel is configured |
| No duplicate warning messages per session | Zero duplicates (enforced by `notifiedAt` gate) |
| "Extend Session" resets timer and clears `notifiedAt` | 100% of successful clicks |
| "Remove Permission" immediately revokes elevation from Discord | 100% of admin clicks |
| "Remove Permission and Block" revokes and sets `blockedAt` | 100% of admin clicks |
| Blocked users cannot elevate until unblocked | Enforced at `/elevate` handler |
| `/watchtower-unlock` clears `blockedAt` in addition to `lockedAt` | Verified |
| Configurable warning lead time per guild via `/watchtower-config` | Supported (0 disables) |
| No performance regression in the expiry cron job | Cron completes within 60-second window |

---

## Scope

### In Scope

- New `GuildConfig` field: `notifyBeforeMin Int @default(5)` — minutes before expiry to post warning. `0` disables.
- New `ActiveElevation` field: `notifiedAt DateTime?` — idempotency gate; cleared on session extension so warning re-fires near new expiry.
- New `PimUser` field: `blockedAt DateTime?` — set when admin uses "Remove Permission and Block"; prevents future elevations.
- Cron job extended: warning scan runs each tick before the expiry scan.
- Warning message: posted to `auditChannelId`, pings the user, shows expiry timestamp, includes "Extend Session" button.
- Elevation-granted message: the existing alert-channel post is moved/extended to `auditChannelId` and gains "Remove Permission" and "Remove Permission and Block" buttons.
- Button interaction routing: `interactionCreate.ts` routes `customId` prefixes `extend_session:`, `remove_perm:`, `remove_perm_block:`.
- "Extend Session" handler: auth check (user only), resets `expiresAt`, clears `notifiedAt`, writes `ELEVATION_EXTENDED` audit log.
- "Remove Permission" handler: admin check, removes Discord role, deletes `ActiveElevation`, writes `ELEVATION_ADMIN_REVOKED` audit log.
- "Remove Permission and Block" handler: admin check, removes role, deletes `ActiveElevation`, sets `blockedAt`, writes `ELEVATION_ADMIN_REVOKED_BLOCKED` + `ELEVATION_BLOCKED` audit logs.
- `/elevate` command updated: check `blockedAt` in addition to `lockedAt`; return appropriate error.
- `/watchtower-unlock` command updated: clear `blockedAt` in addition to `lockedAt` and `failedAttempts`.
- `/watchtower-config` updated: new `notify-before` integer option (0–60).
- `help.ts` updated to document `notify-before`.
- New `AuditEventType` values: `ELEVATION_EXPIRY_WARNING`, `ELEVATION_EXTENDED`, `ELEVATION_ADMIN_REVOKED`, `ELEVATION_ADMIN_REVOKED_BLOCKED`, `ELEVATION_BLOCKED`.
- DB migration: camelCase column names, additive only, no data loss.

### Out of Scope

- Per-user opt-out of warning messages.
- Multiple staged warnings (e.g. 10 min + 2 min).
- Warning when no `auditChannelId` is configured (silently skipped).
- Unblock command as a separate slash command (reuses `/watchtower-unlock`).
- Retroactive warnings for elevations already within the window at deploy time (fired on next cron tick).

---

## Dependencies

- `src/jobs/expireElevations.ts` — extended, not replaced
- `src/lib/guildConfig.ts` — new field read
- `src/lib/audit.ts` — new event types
- `src/lib/permissions.ts` — `isWatchtowerAdmin()` reused in button handlers
- `src/events/interactionCreate.ts` — button routing added
- `src/commands/user/elevate.ts` — `blockedAt` check added
- `src/commands/admin/unlock.ts` — `blockedAt` cleared
- `src/commands/admin/config.ts` — `notify-before` option added
- `src/commands/user/help.ts` — updated

---

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| `auditChannelId` not configured — warning silently skipped | Medium | Document in help; no crash |
| Button clicked after elevation already expired/deleted | Medium | Handler checks elevation still exists; returns graceful error |
| Admin button clicked by non-admin | Low | `isWatchtowerAdmin()` check in handler; ephemeral error reply |
| "Extend Session" clicked by wrong user | Low | `interaction.user.id === discordUserId` check; ephemeral error |
| Duplicate warnings if cron overlaps | Low | `notifiedAt IS NULL` DB gate |
| `blockedAt` confused with `lockedAt` | Low | Clear naming; both cleared by `/watchtower-unlock` |
