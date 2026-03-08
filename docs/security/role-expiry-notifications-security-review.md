# Security Review: Role Expiry Notifications

**Feature:** role-expiry-notifications
**Date:** 2026-03-08
**Reviewer:** Security Engineer
**Standard:** OWASP Top 10 (2021)

---

## Overall Finding: PASS — No Critical or High issues

---

## A01: Broken Access Control

### Button authentication — Extend Session

**Finding:** PASS

`handleExtendSession` fetches the `ActiveElevation` record from the database and compares `interaction.user.id` against `elevation.pimUser.discordUserId`. This is a server-side check against authoritative DB data — not a client-supplied claim. A different user clicking the button receives a non-informative ephemeral error with no state change.

The elevation ID in the `customId` is a CUID (cryptographically random, not guessable). Even so, the server-side re-validation means guessing a CUID would still not grant access to another user's session.

### Button authentication — Remove Permission / Remove Permission and Block

**Finding:** PASS

Both admin handlers call `isWatchtowerAdmin(interaction.member as GuildMember, config)` where `config` is fetched fresh from the database on each click — not cached. This is consistent with the pattern used in all other admin commands. The Watchtower Admin role check is the sole gate; Discord `Administrator` permission alone is insufficient when `adminRoleId` is configured.

An unauthorized user clicking either button receives an ephemeral error with no state change and no information disclosure.

### Block enforcement in `/elevate`

**Finding:** PASS

The `blockedAt` check is performed before password verification and role assignment. Blocked users receive a clear but non-specific error message ("blocked by an administrator") without leaking the reason for the block or the admin who applied it.

### `/watchtower-unlock` guard

**Finding:** PASS

The guard was correctly relaxed from `!pimUser.lockedAt` to `!pimUser.lockedAt && !pimUser.blockedAt` — allowing unlock when either or both conditions are set. The admin check (`isWatchtowerAdmin`) runs before the guard, so only admins can clear blocks. This is correct.

---

## A02: Cryptographic Failures

**Finding:** PASS — No new cryptographic surface.

No passwords, tokens, or secrets are introduced by this feature. The `blockedAt` and `notifiedAt` fields are timestamps. CUID-based elevation IDs are used in button customIds — these are not sensitive secrets but are non-guessable, which is appropriate for defense-in-depth.

---

## A03: Injection

**Finding:** PASS

All database access uses Prisma parameterised queries. No raw SQL is constructed with user input. The `elevationId` parsed from `customId` is passed as a Prisma `where: { id: elevationId }` clause — parameterised, not interpolated.

The migration SQL is static (no user input involved in schema changes).

---

## A04: Insecure Design

**Finding:** PASS

**Idempotency:** `notifiedAt IS NULL` is the gate for the warning scan. Setting it before attempting the channel post (not after) prevents infinite retry spam if the channel is broken. This is the correct ordering.

**Race condition (expiry + warning):** The warning scan filters `expiresAt > now`, so an elevation that expires between the warning scan and the expiry scan in the same cron tick will be handled by the expiry scan and not warned. Safe.

**Session extension without re-authentication:** Deliberate design decision (convenience feature). The extension is gated by Discord identity (the user must be the one who holds the elevation) and is logged in the audit trail (`ELEVATION_EXTENDED`). The extension does not bypass `blockedAt` or `lockedAt` because a blocked/locked user would not have an active elevation in the first place.

---

## A05: Security Misconfiguration

**Finding:** PASS

No new environment variables, no new bot permissions, no new configuration exposure. `notifyBeforeMin = 0` correctly disables the feature, providing an opt-out.

The `customId` field for buttons is not considered sensitive by Discord's design (it is visible in the client), and the handlers correctly re-validate all security conditions server-side on every click.

---

## A06: Vulnerable and Outdated Components

**Finding:** N/A — No new dependencies introduced.

---

## A07: Identification and Authentication Failures

**Finding:** PASS

All button interactions inherit Discord's session identity (`interaction.user.id`). There is no custom session management. Discord handles authentication; the bot handles authorisation (role/identity checks on top of Discord's authenticated user).

---

## A08: Software and Data Integrity Failures

**Finding:** PASS

The migration is additive only (three `ADD COLUMN` statements, five `ALTER TYPE ADD VALUE` statements). No existing data is modified or deleted. No existing columns are dropped. Backward compatibility is maintained — the migration can be deployed while the old bot version is briefly still running.

---

## A09: Security Logging and Monitoring Failures

**Finding:** PASS

Five new audit event types are added covering every new security-relevant action:

| Event | When |
|---|---|
| `ELEVATION_EXPIRY_WARNING` | Warning message posted |
| `ELEVATION_EXTENDED` | User extends session |
| `ELEVATION_ADMIN_REVOKED` | Admin removes permission |
| `ELEVATION_ADMIN_REVOKED_BLOCKED` | Admin removes permission and blocks |
| `ELEVATION_BLOCKED` | User is blocked |

All events are written to the immutable `audit_logs` table before Discord API calls. If the Discord channel post fails, the DB record is still written. This is the correct ordering.

Admin actions include `revokedBy` / `blockedBy` in metadata alongside `isWatchtowerAdmin: true`, providing full traceability.

---

## A10: Server-Side Request Forgery

**Finding:** N/A — No HTTP requests made by new code. Discord API calls are made through the discord.js client, which uses the bot token for authentication.

---

## Additional Findings

### Information Disclosure — ephemeral replies

All new bot replies to button interactions use `deferReply({ flags: MessageFlags.Ephemeral })`. Error messages reveal no internal state — they say "This elevation has already expired or been revoked" (not the ID, not the DB row state, not the admin who acted).

### Denial of Service — cron job

The warning scan queries guild configs first (bounded by number of guilds) then elevations per guild (bounded by active sessions). Both are small result sets in normal operation. No unbounded in-memory accumulation. Non-fatal error handling means a broken audit channel cannot stall the cron job.

---

## Summary

| OWASP Category | Status | Notes |
|---|---|---|
| A01 Broken Access Control | Pass | Server-side re-validation on every button click |
| A02 Cryptographic Failures | Pass | No new crypto surface |
| A03 Injection | Pass | All DB via Prisma parameterised queries |
| A04 Insecure Design | Pass | Correct idempotency and ordering |
| A05 Security Misconfiguration | Pass | No new attack surface |
| A06 Vulnerable Components | N/A | No new dependencies |
| A07 Auth Failures | Pass | Discord identity + isWatchtowerAdmin() |
| A08 Integrity Failures | Pass | Additive migration only |
| A09 Logging Failures | Pass | Full audit coverage |
| A10 SSRF | N/A | No HTTP calls |
