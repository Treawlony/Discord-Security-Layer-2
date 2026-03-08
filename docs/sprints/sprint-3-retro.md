# Sprint 3 Retrospective: Role Expiry Notifications

**Sprint:** 3
**Date:** 2026-03-08
**Feature:** role-expiry-notifications (EPIC-003)

---

## Sprint Review — What Was Delivered

All 8 stories completed. 0 deferred.

| Story | Delivered |
|---|---|
| STORY-008: DB migration | `20260308000001_add_expiry_notifications` — 3 columns + 5 enum values, camelCase, additive |
| STORY-001: Warning message to audit channel | `runWarningScan()` in `expireElevations.ts` — posts with Extend Session button, sets `notifiedAt` |
| STORY-002: Extend Session button | `handleExtendSession()` in `buttonHandlers.ts` — resets `expiresAt`, clears `notifiedAt`, audit log |
| STORY-003: Elevation-granted buttons | `elevate.ts` collector — posts to `auditChannelId` with Remove Permission / Remove Permission and Block |
| STORY-004: Remove Permission handler | `handleRemovePerm()` — admin-gated, removes role, deletes record, disables buttons |
| STORY-005: Remove Permission and Block | `handleRemovePermBlock()` — admin-gated, sets `blockedAt`, two audit logs |
| STORY-006: Block enforcement + unlock | `elevate.ts` `blockedAt` check; `unlock.ts` clears both locks |
| STORY-007: Config + help update | `config.ts` `notify-before` option (0–60); embed field; caution note; `help.ts` updated |

---

## Velocity

- **Planned:** 18 story points
- **Completed:** 18 story points
- **Tests written:** 89 new tests (85 feature + 4 Must Fix coverage); 164 total passing
- **Files changed:** 11 modified, 2 new source files, 1 new migration, 1 new test file
- **Must Fix issues found in code review:** 2 (both resolved before merge)
- **Security issues (Critical/High):** 0

---

## What Went Well

- The `skipChannelPost` design found during code review was a clean, backward-compatible fix. Adding an optional field to `AuditParams` touched exactly one interface and zero existing callers.
- Separating button handlers into `src/lib/buttonHandlers.ts` kept `interactionCreate.ts` as a thin router — easy to extend with future button types.
- The `remove_perm_block:` / `remove_perm:` prefix ordering issue was caught at design time (documented in architecture spec) and verified by a dedicated test, preventing a subtle runtime bug.
- The discovery-phase revision (replacing DM approach with audit-channel interactive buttons) produced a significantly better design — buttons in context are more operationally useful than DMs, and the session extension UX is more natural.

## What Could Be Improved

- The double `getOrCreateGuildConfig` call in `elevate.ts` (fetched as `config` at the top, then again as `freshConfig` inside the collector) creates a minor inconsistency where `expiresAt` is computed from one config snapshot and channel IDs from another. This is a pre-existing pattern that surfaced during review. Log it for the next refactor sprint.
- The `ELEVATION_ADMIN_REVOKED` audit event uses the same `discordUserId` field for the elevated user (correct for audit trail), but the admin who acted is only in `metadata.revokedBy`. A future enhancement could add a dedicated `actorDiscordUserId` field to `AuditLog` for clearer querying.

---

## Backlog Items Surfaced

| Item | Priority | Notes |
|---|---|---|
| Refactor double `getOrCreateGuildConfig` in `elevate.ts` | Low | Pre-existing; deferred from code review SF-01 |
| Per-user opt-out of expiry warning pings | Low | Requires new `PimUser` field; post-MVP |
| `actorDiscordUserId` on `AuditLog` for admin-originated events | Low | Quality-of-life for audit queries |
| Staged warnings (e.g. 10 min + 2 min) | Low | Out of scope for v0.1.0; assess demand |
