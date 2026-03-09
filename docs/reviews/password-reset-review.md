# Code Review: Self-Service Password Reset via Admin

**Feature:** PIM-003 — `/watchtower-reset-password`
**Reviewer:** Code Reviewer
**Date:** 2026-03-09
**Status: APPROVED — No Must Fix items**

---

## Files Reviewed

| File | Change Type |
|---|---|
| `prisma/schema.prisma` | Modified |
| `prisma/migrations/20260309000000_nullable_password_hash/migration.sql` | New |
| `src/commands/admin/reset-password.ts` | New |
| `src/commands/user/elevate.ts` | Modified |
| `src/lib/audit.ts` | Modified |
| `src/commands/user/help.ts` | Modified |
| `tests/password-reset.test.ts` | New |
| `tests/admin-guard.test.ts` | Modified |
| `tests/help-command.test.ts` | Modified |

---

## Must Fix

None.

---

## Should Fix

None.

---

## Consider (Non-blocking observations and suggestions for future sprints)

### C-01 — Unused import in test file

**File:** `tests/password-reset.test.ts`, lines 12–14

```typescript
import { data as resetPasswordData, execute as resetPasswordExecute } from "../src/commands/admin/reset-password";
import { data as elevateData } from "../src/commands/user/elevate";
import { ChatInputCommandInteraction, Client } from "discord.js";
```

`resetPasswordExecute`, `elevateData`, `ChatInputCommandInteraction`, and `Client` are imported but never used (the execute test was refactored from a runtime mock into a source-analysis test). TypeScript's `noUnusedLocals` would flag these if enabled. They are harmless at runtime and Jest does not enforce them, but they add noise.

Suggestion for next sprint: enable `"noUnusedLocals": true` in `tsconfig.json` and clean up unused imports across the test suite (not just this file — the pattern may exist elsewhere).

### C-02 — `permissions.test.ts` uses stale `GuildConfig` shape

**File:** `tests/permissions.test.ts`, line 27

```typescript
sessionDurationMin: 60,
```

`GuildConfig` no longer has `sessionDurationMin` — it was renamed to `sessionDurationSec` in migration `20260308000002`. The test constructs a plain object cast to `GuildConfig` via `as GuildConfig`, so TypeScript's structural typing does not flag the extra field at runtime (the property is simply ignored). The test passes and the logic is correct, but the helper is out of date.

Suggestion for next sprint: update `buildConfig` in `permissions.test.ts` to use `sessionDurationSec: 3600` instead of `sessionDurationMin: 60`, to match the current schema and prevent future confusion.

### C-03 — Comment in `elevate.ts` null-password guard could be more specific

**File:** `src/commands/user/elevate.ts`, line 58

```typescript
// Null-password check — set when admin runs /watchtower-reset-password
```

This is clear and correct. A minor improvement would be to name the specific field being checked:

```typescript
// Null passwordHash — admin ran /watchtower-reset-password; user must re-set before elevating
```

This is stylistic only and does not affect correctness.

### C-04 — `reset-password.ts` does not guard against self-reset

The command allows an admin to reset their own password. This is intentional per the stories (no special restriction was specified), and is audited. However, if a future policy requirement emerges that admins should not be able to reset their own PIM passwords (e.g. to prevent social engineering where an attacker with admin access locks themselves out and resets, then re-elevates), a `target.id === interaction.user.id` guard could be added.

This is a product decision, not a code defect. Noting for awareness.

---

## Positive Observations

- **Pattern consistency:** `reset-password.ts` is a near-perfect structural match for `unlock.ts`. Same import set, same guard ordering, same error messages for the "no PIM account" case, same metadata format. A developer familiar with `unlock.ts` can read `reset-password.ts` in under a minute.

- **TypeScript null safety used correctly:** Making `passwordHash` nullable in the schema and relying on TypeScript's type narrowing (rather than a non-null assertion) to enforce the null guard in `elevate.ts` is the right approach. The compiler becomes a correctness enforcer for the security contract.

- **Atomic DB update:** All four fields (`passwordHash`, `lockedAt`, `blockedAt`, `failedAttempts`) are cleared in a single `pimUser.update` call. This is correct — there is no observable intermediate state where the hash is null but the lockout fields are still set.

- **Migration hygiene:** The migration is minimal, non-destructive, and follows the established camelCase convention. The SQL comment at the top explains the purpose and references the convention explicitly.

- **Test coverage:** 40 new test cases covering every acceptance criterion. The structural assertion approach (reading source files) is well-suited to this codebase and catches accidental removal of security-critical code.

- **No `skipChannelPost`:** Correctly omitted — this event has no interactive buttons, so the standard audit channel echo is the right behaviour.

---

## Summary

The implementation is clean, consistent with established patterns, and correct. All acceptance criteria from the stories are verifiable via the test suite. The security review found no issues. The two "Consider" items about unused test imports and a stale field name in `permissions.test.ts` are minor housekeeping items for the next sprint rather than blockers.

**Decision: APPROVED for merge.**
