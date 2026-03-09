# Sprint 5 Retrospective: v0.4.0 — Operational Improvements & Admin Tooling

**Sprint:** 5
**Version:** v0.4.0
**Date:** 2026-03-09

---

## Sprint Review — What Was Completed

All 5 planned stories delivered. No scope was deferred.

| Story | Delivered | Notes |
|---|---|---|
| Graceful Shutdown | `src/index.ts`, `src/jobs/expireElevations.ts` | SIGTERM/SIGINT handlers with double-signal guard; `startExpiryJob` returns `ScheduledTask` handle |
| Rate Limiting on `/elevate` | `src/commands/user/elevate.ts` | Rolling 60s window, 3 attempts max, per-guild+user key, no audit entry on rejection |
| Bulk Eligibility Assignment | `src/commands/admin/assign.ts` | 3-role support, idempotent, discriminated union outcome reporting, deduplication |
| `/watchtower-list` Active Elevations | `src/commands/admin/list.ts` | Active elevations section, relative timestamps, 20/5 field budget, unified `baseWhere` |
| `/watchtower-audit` Command | `src/commands/admin/audit.ts` | `user` and `recent` subcommands, char-budget truncation, `eventTypeEmoji` reuse |

Supporting changes delivered alongside stories:
- `src/lib/audit.ts`: `eventTypeEmoji` promoted to named export
- `src/commands/user/help.ts`: `/watchtower-audit` documented, `/watchtower-assign` description updated
- `tests/admin-guard.test.ts`: `"audit"` enrolled in guard loop; assertion updated for new assign.ts text
- `tests/v0.4.0-features.test.ts`: 129-test structural + logic QA suite (net of test fixes)

---

## Metrics

| Metric | Value |
|---|---|
| Stories planned | 5 |
| Stories completed | 5 |
| Tests at sprint start | 278 |
| Tests at sprint end | 407 |
| New tests written | 129 |
| TypeScript errors | 0 |
| New lint errors introduced | 0 |
| Security issues found | 0 (audit confirmed) |
| Performance concerns | 0 (audit confirmed — no N+1, no index gaps) |
| Code review Must Fix resolved | 1 (MF-1) |
| Code review Should Fix resolved | 4 (SF-1 through SF-4) |
| DB migrations | 0 |

---

## What Went Well

1. **Zero schema migrations** — all five features were designed to reuse the existing data model. This significantly reduces deployment risk and eliminates the migration-first coordination overhead that has affected previous sprints.

2. **Discriminated union pattern in bulk assign** — the `RoleOutcome` type with exhaustive `switch` in `outcomeLabel` means TypeScript enforces that any future status variant is handled at compile time. This pattern should be considered for other multi-outcome command flows.

3. **Structural test suite** — the `v0.4.0-features.test.ts` approach of testing source-text properties (convention compliance, structural assertions, pure logic unit tests) without requiring a running bot or database proved effective. All 129 tests pass without mocking Discord.js or Prisma.

4. **Code review caught real issues** — SF-4 (asymmetric `required` on `recent` limit) was a genuine UX bug that would have caused confusing Discord UI behaviour. The review process caught it before merge.

5. **Rate limiter isolation** — keying the cooldown on `${guildId}:${userId}` rather than `${userId}` was identified and implemented correctly on the first pass. Multi-guild isolation is a recurring source of bugs in Discord bots; getting it right without a bug cycle is a win.

---

## What to Improve

1. **Test fixture coupling to variable names** — two tests in `v0.4.0-features.test.ts` searched source text for `assignmentWhere` and `elevationWhere` by exact name. When SF-3 renamed these to `baseWhere`, the tests broke (correctly — they caught the refactor). However the fix required reading the intent of the test and updating the search token. Future structural tests should anchor on observable behaviour (the query contains `guildId`) rather than internal variable names where possible.

2. **Rate-limit state not surfaced in audit** — rate-limited rejections currently produce no audit trail. For a PIM system this is acceptable (the brute-force lockout is the hard gate), but operators have no way to detect sustained `/elevate` spam patterns from the audit log alone. A low-priority future story could add a `RATE_LIMITED` audit event type (with a separate cooldown on the audit write itself to avoid log flooding).

3. **`/watchtower-audit` embed UX** — the char-budget truncation is functional but presents as a raw "Showing X of Y" footer. A future improvement could add a timestamp range ("Entries from [date] to [date]") to give operators more context without requiring a separate query.

---

## Backlog Items Surfaced During Sprint

The following items were identified during implementation or review and are candidates for a future sprint:

| Item | Source | Priority |
|---|---|---|
| `RATE_LIMITED` audit event type (with write-cooldown) | Retro | Low |
| `/watchtower-audit` timestamp range in footer | Retro | Low |
| `commandLoader.ts` `no-var-requires` lint error (pre-existing) | Lint output | Low |
| Rate-limit state reset on bot restart (by design; document in CLAUDE.md) | Review C-note | Low |
| C-4: `/watchtower-assign` reply verb simplification | Code review | Low |

---

## Sprint Close

Sprint 5 is closed. All deliverables merged to `develop`. Ready for merge to `master` and tag `v0.4.0`.
