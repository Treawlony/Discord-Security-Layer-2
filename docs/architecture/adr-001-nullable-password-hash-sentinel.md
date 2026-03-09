# ADR-001: NULL as the sentinel value for admin-reset PIM password state

**Status:** Accepted
**Date:** 2026-03-09
**Feature:** PIM-003 — Self-Service Password Reset via Admin

---

## Context

When an admin runs `/watchtower-reset-password`, the bot must place the target user's `PimUser` record into a state that:

1. Prevents the user from authenticating with `/elevate` until they set a new password.
2. Is unambiguously distinguishable from any legitimate password hash.
3. Requires no new database column, no new model, and no new application state machine.
4. Is compatible with the existing `/set-password` recovery flow without code changes to that command.

Two options were evaluated:

### Option A — Magic string sentinel (e.g. `"__RESET__"`)

Set `passwordHash` to a known constant string that can never be a valid bcrypt hash.

**Pros:**
- Field remains `NOT NULL`; no schema change required.

**Cons:**
- Requires application code to know and check the sentinel string in every place that reads `passwordHash`.
- bcrypt hashes always start with `$2b$` (cost factor prefix); `"__RESET__"` is distinguishable, but this is a coincidence of the current algorithm. If the hashing algorithm ever changes, the invariant must be re-evaluated.
- `verifyPassword("__RESET__", somePassword)` would return `false` rather than error, meaning the null guard must still be added to `/elevate`'s logic — the magic string buys nothing over NULL in terms of where code must change.
- Magic strings are opaque in DB queries and log output; NULL is semantically self-documenting.

### Option B — NULL sentinel (chosen)

Make `passwordHash` nullable (`String?`) and set it to `NULL` on reset.

**Pros:**
- NULL is unambiguous: no bcrypt hash, real or attacker-crafted, can ever be `NULL`. The check `passwordHash === null` is a complete, unforgeable test.
- TypeScript enforces correctness: changing `passwordHash` from `string` to `string | null` causes a compile error at the `verifyPassword(password, pimUser.passwordHash)` call site (which accepts `string`, not `string | null`). The compiler mandates the null guard — it cannot be accidentally omitted.
- Semantically clear in the database: a `NULL` hash row means "no credential set", which matches the state of a user who has never run `/set-password` (except that user wouldn't have a `PimUser` row at all — so NULL + existing row unambiguously means "was reset").
- No special handling needed in `/set-password`: the existing `update` branch writes a new non-null hash over whatever was there — it works identically whether the previous value was a hash string or NULL.

**Cons:**
- Requires a Prisma schema change (`String` → `String?`) and a corresponding migration (`DROP NOT NULL`).
- The `DROP NOT NULL` operation cannot be reversed if any row has a NULL value at rollback time without first patching the data.

## Decision

**Option B (NULL sentinel) is adopted.**

The TypeScript compiler enforcement is the decisive factor. With Option A, a developer who forgets to add the magic-string guard in a new command or a future code path would see no compile error — the bug would be silent. With Option B, the same omission produces a type error at `verifyPassword`, making the security invariant structurally enforced rather than convention-enforced.

The migration cost is low: `ALTER COLUMN DROP NOT NULL` is non-destructive and completes in milliseconds on any realistic table size.

## Consequences

- `PimUser.passwordHash` is `String?` in Prisma schema going forward. Any future code that reads this field must handle `null`.
- The null guard in `/elevate` (`if (pimUser.passwordHash === null)`) is the canonical location for handling this state in user-facing flows.
- Admin commands that read `passwordHash` directly (currently none) must also handle `null` if added in future.
- The migration `20260309000000_nullable_password_hash` is a permanent part of the migration history and cannot be removed.
