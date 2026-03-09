# Security Review: Self-Service Password Reset via Admin

**Feature:** PIM-003 — `/watchtower-reset-password`
**Reviewer:** Security Engineer
**Date:** 2026-03-09
**Status: PASSED — No Critical or High issues found**

---

## Scope

Files reviewed:
- `src/commands/admin/reset-password.ts` (new)
- `src/commands/user/elevate.ts` (modified — null-password guard)
- `prisma/schema.prisma` (modified — nullable field + new enum value)
- `prisma/migrations/20260309000000_nullable_password_hash/migration.sql` (new)
- `src/lib/audit.ts` (modified — emoji map entry)
- `src/commands/user/help.ts` (modified — static embed text)

---

## OWASP Top 10 Assessment

### A01 — Broken Access Control

**Finding:** No issues.

- `isWatchtowerAdmin(member, config)` is called as the first business-logic statement after `deferReply`, before any DB reads or writes. An unauthorized caller cannot cause any side effect.
- Guild isolation is enforced: the `PimUser` lookup uses the compound unique key `{ discordUserId: target.id, guildId }` sourced from `interaction.guildId!`. A user in Guild A cannot reset a password for a user in Guild B.
- `interaction.guildId!` is safe in slash command context — Discord guarantees it is present for guild commands. The non-null assertion is consistent with all other commands.
- No `setDefaultMemberPermissions` is set, which is correct per CLAUDE.md convention — the runtime guard is the sole gate and is implemented correctly.

### A02 — Cryptographic Failures

**Finding:** No issues.

- The command sets `passwordHash = null`. It does not generate, store, or transmit any new credential.
- No password is passed in the command arguments. The admin cannot set a password on behalf of a user — this is intentional and correct. The user must authenticate themselves via `/set-password` (which enforces complexity rules and bcrypt hashing with 12 rounds).
- The null state is transient — it exists only until the user runs `/set-password`. There is no window where a user could authenticate with a null hash because the null guard in `/elevate` fires before `verifyPassword`.

### A03 — Injection

**Finding:** No issues.

- All DB queries use Prisma's parameterised query builder. No raw SQL is executed in application code.
- The migration SQL is static — it contains no user-supplied values.
- The Discord user ID (`target.id`) passed to `findUnique` is sourced from the discord.js `User` object, which Discord validates as a Snowflake before delivery. It is never interpolated into raw SQL.

### A04 — Insecure Design

**Finding:** No issues.

- The "null as sentinel" design is unambiguous. There is no bcrypt hash that could ever be parsed as NULL (bcrypt output always begins with `$2b$`), so there is no edge case where a stored hash could be mistaken for the reset state.
- The guard ordering in `/elevate` (lockedAt → blockedAt → passwordHash null → verifyPassword) is correct. A reset simultaneously clears both lock fields, so the lock checks will always pass after a reset, and the null check is the only gate remaining.
- Clearing `lockedAt`, `blockedAt`, and `failedAttempts` in the same atomic `update` as `passwordHash: null` ensures the user starts from a completely clean state, with no residual lock that could trap them.
- Active elevation sessions are intentionally left untouched. This is correct — a password reset does not imply the current session was illegitimate. If an admin wants to also end the session, they should use the "Remove Permission" button or `/watchtower-revoke`.

### A05 — Security Misconfiguration

**Finding:** No issues.

- No new environment variables, no new default values, no new config options.
- The migration is additive only (`DROP NOT NULL` + `ADD VALUE`) — no existing configuration is altered.

### A06 — Vulnerable and Outdated Components

**Finding:** Out of scope for this feature — no new dependencies introduced.

### A07 — Identification and Authentication Failures

**Finding:** No issues.

- The feature explicitly improves this area: it removes the only recovery path that previously bypassed authentication controls entirely (direct DB access).
- The null guard ensures a user with a reset password cannot authenticate at all — they receive a clear, actionable error and must set a new password through the validated `/set-password` flow (complexity-enforced, bcrypt-hashed).
- The reset does not bypass 2FA, server verification, or any other Discord-level auth mechanism.

### A08 — Software and Data Integrity Failures

**Finding:** No issues.

- The Prisma migration is applied atomically. The `DROP NOT NULL` operation does not modify existing data.
- The `PimUser.update` call is a single DB operation — it cannot partially succeed (Prisma wraps single-model mutations in implicit transactions).

### A09 — Security Logging and Monitoring Failures

**Finding:** No issues.

- Every successful reset writes a `PASSWORD_RESET` audit log entry to the `audit_logs` table (immutable, append-only).
- The audit log includes `resetBy` (admin Discord user ID) and `isWatchtowerAdmin: true` — sufficient to reconstruct who performed the action and with what authority.
- The event is echoed to the configured audit channel, providing real-time visibility to server operators.
- No `skipChannelPost` is used — the echo is not suppressed.
- The target user (`discordUserId`) is recorded in the log, not just the admin.

### A10 — Server-Side Request Forgery

**Finding:** No issues. No outbound HTTP requests are made. All external calls are to Discord's API via discord.js (for `deferReply` and `editReply`) and to the local PostgreSQL instance via Prisma.

---

## Additional Security Checks

### Privilege Escalation

The command cannot be used to grant elevated roles, create new sessions, or expand any user's permissions. It can only *clear* a credential. The lowest possible privilege state after a reset (null hash, no locks) still requires the user to set a new password and be granted eligibility by an admin before any elevation is possible.

### Information Disclosure

- The admin reply (`<@user>'s PIM password has been reset...`) reveals only that the action was taken and who the target is. No hash, no session data, no eligible roles are disclosed.
- The user-facing error in `/elevate` (`Your PIM password has been reset by an administrator`) does not reveal the admin's identity. This is intentional.
- The audit channel message format (`PASSWORD_RESET — <@user> — <timestamp>`) does not include the old hash or any other credential material.

### Denial of Service via Repeated Resets

An admin could theoretically reset a user's password repeatedly, forcing them to re-set it continuously. However:
- This requires holding the Watchtower Admin role.
- Every reset is written to the audit log with `resetBy`, making abuse trivially attributable.
- This is the same trust boundary as all other admin commands — admins are trusted actors.

### Double Reset (Idempotency)

Resetting a user who already has `passwordHash = null` is safe: Prisma `update` with `{ passwordHash: null }` on an already-null field is a no-op at the DB level. A second audit log entry is written, which is correct behaviour (it captures that the action was attempted again).

---

## Findings Summary

| Severity | Count | Description |
|---|---|---|
| Critical | 0 | — |
| High | 0 | — |
| Medium | 0 | — |
| Low | 0 | — |
| Informational | 1 | Repeated-reset abuse possible but attributable via audit log (accepted risk, consistent with all other admin commands) |

**Decision: APPROVED for merge.** No blocking issues.
