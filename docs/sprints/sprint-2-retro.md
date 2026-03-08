# Sprint 2 Retrospective: Watchtower Admin Role

**Sprint:** 2
**Date:** 2026-03-08
**Goal:** Ship the Watchtower Admin Role feature

---

## Sprint Review — What Was Completed

| Task | Status | Notes |
|---|---|---|
| T1 — Schema: adminRoleId + ADMIN_ROLE_CONFIGURED | Done | Migration file created manually (no local DB); Prisma client regenerated successfully |
| T2 — Library: src/lib/permissions.ts | Done | 15 unit tests, all passing |
| T3 — Runtime guard: assign, revoke, list, unlock | Done | Identical guard pattern across all four commands |
| T4 — Extend /watchtower-config | Done | New option, embed field, audit event, warning message |
| T5 — Elevate role filter | Done | Filter + collector lookup both use availableRoles |
| T6 — Tests | Done | 75 total tests (15 unit + 49 structural + 11 regression) |

All 6 tasks completed. All stories delivered.

---

## Definition of Done — Verification

- [x] All five admin commands return "permission denied" to a non-admin user (structural tests verify guard presence in each file)
- [x] Server owner (Administrator, adminRoleId null) can configure the bot (bootstrap logic verified by unit tests)
- [x] Once adminRoleId is set, Administrator alone is denied (core security test passing: "returns false when member has Administrator but NOT the admin role")
- [x] Watchtower Admin role absent from /elevate dropdown (filter verified by structural test + availableRoles.find() used in collector)
- [x] All admin audit logs carry isWatchtowerAdmin flag (structural test covers assign, revoke, unlock, config)
- [x] TypeScript compiles without errors (`npm run typecheck` clean)
- [x] No regressions on /elevate and /set-password (help-command.test.ts all passing; no changes to set-password.ts)

---

## Velocity

| Metric | Value |
|---|---|
| Story points planned | 6 tasks |
| Story points completed | 6/6 (100%) |
| Tests written | 64 new (15 unit + 49 structural) |
| Security issues found | 1 Medium (informational — lockout risk if admin role deleted; documented in runbook) |
| Code review Must Fix items | 0 |
| Code review items resolved | 1 Should-Fix (variable shadow in revoke.ts — fixed during review) |

---

## Retrospective

### What Went Well

- **Single-responsibility library module**: `isWatchtowerAdmin()` as a pure, synchronous function made the guard trivially testable and completely consistent across all five commands. No async timing issues, no DB coupling.
- **Bootstrap design**: The null-check fallback to `Administrator` elegantly solves the chicken-and-egg problem without any special-case code in command handlers.
- **Structural tests**: Testing the guard by reading source files is pragmatic — it verifies the guard cannot be accidentally removed without test failures, without needing a running Discord bot.
- **Catch during code review**: The `member` variable shadow in `revoke.ts` was caught before merge — the outer `member` (invoking user cast) was being shadowed by the inner `member` (target guild member fetch). Renamed to `targetMember`.

### What Could Be Improved

- **Migration management**: Without a local DB, migration files must be hand-authored. A dev Docker Compose profile with a throwaway Postgres instance would allow `prisma migrate dev` to generate migrations correctly. This is a tooling gap for future sprints.
- **Config variable naming inconsistency**: `config.ts` uses `current`/`updated` naming while other commands use `config`. A cleanup sprint item has been logged.

### Process Observations

- The "Administrator alone denied once adminRoleId is set" requirement was clarified after Discovery Phase 1 — this is the kind of subtle security invariant that benefits from an explicit test with a clear name ("core security requirement"). The unit test name makes it impossible to misread.

---

## Backlog Items Surfaced

| Item | Priority | Notes |
|---|---|---|
| Set `setDefaultMemberPermissions(0n)` on admin commands for UX consistency | Low | Currently `ManageRoles` hides commands from Watchtower Admins who lack that Discord perm |
| `PERMISSION_DENIED` audit event type | Medium | Track denied admin access attempts for threat detection |
| Cleanup: rename `current`/`updated` to `config`/`saved` in config.ts | Low | Naming consistency |
| Dev Docker profile with throwaway Postgres | Medium | Enable `prisma migrate dev` locally |
