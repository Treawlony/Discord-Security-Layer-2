# Test Report: Self-Service Password Reset via Admin

**Feature:** PIM-003 — `/watchtower-reset-password`
**Date:** 2026-03-09
**Test runner:** Jest 29 + ts-jest
**Result: PASSED — 257/257 tests**

---

## New Test File

**`tests/password-reset.test.ts`** — 40 new tests across 9 describe blocks.

### Test coverage by story

| Story | Describe block | Tests |
|---|---|---|
| STORY-01 | reset-password command — data export | 4 |
| STORY-01 | reset-password command — structural source checks | 17 |
| STORY-01 | reset-password command — guard ordering | 1 |
| STORY-02 | schema.prisma — passwordHash nullable | 2 |
| STORY-02 | nullable_password_hash migration | 4 |
| STORY-01 | audit.ts — PASSWORD_RESET emoji | 1 |
| STORY-03 | elevate command — null-password guard | 5 |
| STORY-04 | set-password command — unchanged for null-hash recovery | 3 |
| STORY-05 | help command — lists /watchtower-reset-password | 2 |

---

## Modified Existing Tests

### `tests/admin-guard.test.ts`
- Added `"reset-password"` to `ADMIN_COMMANDS` array — ensures the new command is checked for: isWatchtowerAdmin import, getOrCreateGuildConfig, guard call, permission-denied reply, GuildMember import.
- Added `"reset-password"` to `AUDIT_COMMANDS` array — ensures `isWatchtowerAdmin: true` is present in audit metadata.
- **Net new assertions:** 6 (5 guard tests + 1 audit metadata test, applied to the new command).

### `tests/help-command.test.ts`
- Updated "embed fields cover all eight commands" → "embed fields cover all nine commands".
- Added `/watchtower-reset-password` to the expected commands list.
- **Net new assertions:** 1.

---

## Key Scenarios Covered

| Scenario | Test location | Outcome |
|---|---|---|
| Command registered with correct name | data export | PASS |
| Command has one required user option | data export | PASS |
| No `setDefaultMemberPermissions` | data export | PASS |
| `isWatchtowerAdmin` imported and called | structural + admin-guard | PASS |
| Guard fires before business logic | guard ordering | PASS |
| `getOrCreateGuildConfig` called | structural | PASS |
| Permission-denied reply present | structural + admin-guard | PASS |
| PimUser scoped by `discordUserId_guildId` | structural | PASS |
| "Does not have a PIM account" error | structural | PASS |
| `passwordHash: null` in update | structural | PASS |
| `lockedAt: null` in update | structural | PASS |
| `blockedAt: null` in update | structural | PASS |
| `failedAttempts: 0` in update | structural | PASS |
| `PASSWORD_RESET` audit event written | structural | PASS |
| `isWatchtowerAdmin: true` in metadata | structural + admin-guard | PASS |
| `resetBy` in metadata | structural | PASS |
| No `skipChannelPost` | structural | PASS |
| Success reply mentions `/set-password` | structural | PASS |
| `passwordHash String?` in schema | schema check | PASS |
| `PASSWORD_RESET` in enum | schema check | PASS |
| Migration uses camelCase column | migration check | PASS |
| Migration uses `DROP NOT NULL` not `DROP COLUMN` | migration check | PASS |
| Migration adds enum value | migration check | PASS |
| Null check precedes `verifyPassword` | elevate guard | PASS |
| Null check follows `blockedAt` | elevate guard | PASS |
| Null reply tells user to run `/set-password` | elevate guard | PASS |
| Null guard returns before `FAILED_ATTEMPT` | elevate guard | PASS |
| `set-password` update branch handles null hash | set-password check | PASS |
| `PASSWORD_CHANGED` event for re-set (not PASSWORD_SET) | set-password check | PASS |
| `set-password` has no null-hash guard (no code change needed) | set-password check | PASS |
| `/watchtower-reset-password` in help embed | help check | PASS |
| Help description mentions `/set-password` | help check | PASS |
| `PASSWORD_RESET` emoji mapped in audit.ts | audit check | PASS |

---

## Pre-existing Test Suite

All 217 pre-existing tests continue to pass after the changes.

| Suite | Tests | Status |
|---|---|---|
| admin-guard.test.ts | 36 (+6 new assertions via array additions) | PASS |
| duration.test.ts | 20 | PASS |
| expiry-notifications.test.ts | 96 | PASS |
| help-command.test.ts | 11 (+1 updated assertion) | PASS |
| permissions.test.ts | 14 | PASS |
| **password-reset.test.ts** | **40 (new)** | **PASS** |

---

## Test Strategy Notes

All tests use the structural/static analysis approach established by the existing suite — they read source files and assert on their content, or construct minimal mock objects for pure functions. No running bot, no database, and no Discord API calls are required. This approach:

- Prevents accidental deletion of security-critical code (the admin guard, guild isolation scoping, audit log call)
- Runs instantly in CI with no external dependencies
- Validates contracts between stories (e.g. that the schema change and the null guard in elevate.ts are consistent)
