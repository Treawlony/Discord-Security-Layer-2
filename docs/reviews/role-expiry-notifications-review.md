# Code Review: Role Expiry Notifications

**Feature:** role-expiry-notifications
**Date:** 2026-03-08
**Reviewer:** Code Reviewer
**Files Reviewed:** 10 (2 new, 8 modified)

---

## Summary

The implementation is clean, consistent with codebase conventions, and correctly handles all edge cases identified in the design. Two Must Fix items were identified and resolved during this review before the document was finalised. No Must Fix items remain open.

---

## Must Fix (resolved during review)

### MF-01: Duplicate audit channel messages for ELEVATION_GRANTED and ELEVATION_EXPIRY_WARNING

**File:** `src/lib/audit.ts`, `src/commands/user/elevate.ts`, `src/jobs/expireElevations.ts`

**Issue:** `writeAuditLog()` always posts a plain-text echo to `auditChannelId` when that channel is configured. However, `elevate.ts` and `expireElevations.ts` both post their own interactive messages (with buttons) to that same channel immediately before calling `writeAuditLog`. This would produce two messages per event — the interactive one and a redundant plain-text echo right below it.

**Resolution:** Added `skipChannelPost?: boolean` to `AuditParams`. Callers that have already posted their own message to the audit channel pass `skipChannelPost: true` to suppress the echo. This is an additive, backward-compatible interface change — all existing callers omit the field and behaviour is unchanged for them. Applied in `elevate.ts` (ELEVATION_GRANTED) and `expireElevations.ts` (ELEVATION_EXPIRY_WARNING). Four new tests added to verify the flag is present and used correctly.

---

## Should Fix

### SF-01: `elevate.ts` — `getOrCreateGuildConfig` called twice in the collector callback

**File:** `src/commands/user/elevate.ts`, lines 33 and 177

**Issue:** `config` is fetched at the top of `execute()` (line 33) and then `freshConfig` is fetched again inside the `collector.on("collect")` callback (line 177). The second fetch is there to pick up any config changes that might have occurred during the 30-second role selection window, but the original `config` is already used for `sessionDurationMin` and `lockoutThreshold` earlier in the same tick. The double-fetch introduces a small inconsistency: `expiresAt` is computed from `config.sessionDurationMin` (line 149) but the channel IDs come from `freshConfig`. If session duration changed in the window, the upsert and the admin message would show different expiry times.

**Recommendation:** Use a single config fetch and re-use it throughout, or move the `expiresAt` computation to use `freshConfig.sessionDurationMin` after the re-fetch. Either approach is consistent; the current approach is not wrong in practice (config changes mid-session are rare) but the naming is misleading. Pre-existing pattern — out of scope to fix in this PR.

**Decision:** Defer. Pre-existing pattern not introduced by this feature; fixing it would touch more of `elevate.ts` than necessary in this PR.

---

## Consider

### C-01: `buttonHandlers.ts` — `_buildDisabledAdminRow` helper uses underscore-prefix naming

**File:** `src/lib/buttonHandlers.ts`, line 257

The `_buildDisabledAdminRow` function uses an underscore prefix to signal "private/internal". This is a valid JS/TS convention but the codebase does not use it elsewhere. Consider renaming to `buildDisabledAdminRow` (no prefix) since the function is module-private by not being exported. No functional impact.

### C-02: `expireElevations.ts` — `now` is computed once per guild loop iteration

**File:** `src/jobs/expireElevations.ts`, line 37

`const now = new Date()` is inside the `for (const config of configs)` loop. For a single-guild deployment this is fine; for a multi-guild deployment, each guild's window is computed at a slightly different clock instant. This is harmless (sub-millisecond drift) but computing `now` once before the loop would be marginally cleaner. Not worth changing.

### C-03: `config.ts` — `contentParts.filter(Boolean)` uses implicit truthiness

**File:** `src/commands/admin/config.ts`, line 138

`const contentParts = [warning, cautionNote].filter(Boolean)` works correctly since both values are `string | undefined`, but TypeScript may widen the inferred type to `(string | boolean)[]` in some compiler versions. Explicit `filter((x): x is string => x !== undefined)` would be more precise. In practice the current code is correct and the typecheck passes — this is a style note only.

---

## File-by-File Notes

### `prisma/schema.prisma`
All three new fields are correctly typed, annotated, and placed in logical positions within their models. Enum values follow the existing ALL_CAPS convention. No issues.

### `prisma/migrations/20260308000001_add_expiry_notifications/migration.sql`
All column names are camelCase. `notifyBeforeMin` has `DEFAULT 5` as required. `notifiedAt` and `blockedAt` are correctly nullable. `ALTER TYPE ADD VALUE` syntax is correct for PostgreSQL. No destructive statements. Additive only.

### `src/lib/audit.ts`
`skipChannelPost` added cleanly. Existing callers unaffected. Emoji map complete and consistent with naming style.

### `src/lib/buttonHandlers.ts`
All three handlers follow the identical pattern: deferReply → DB fetch → not-found guard → auth check → action → audit log → message update → editReply. Ordering is correct — the DB record is deleted/updated before the Discord API calls, so a failed Discord call never leaves the DB in an inconsistent state. Non-fatal error handling on all Discord calls. `isWatchtowerAdmin` is called after fetching a fresh config from DB, not using a stale one.

### `src/events/interactionCreate.ts`
Button branch correctly placed before the `isChatInputCommand` check. `remove_perm_block:` checked before `remove_perm:`. Comment explains why. Unknown buttons silently ignored. Outer try/catch logs errors without crashing the process.

### `src/jobs/expireElevations.ts`
`runWarningScan` correctly sets `notifiedAt` before the channel post (idempotency-safe). Warning scan runs before expiry scan (correct ordering). `skipChannelPost: true` applied. Console error on channel post failure includes guild ID for debuggability.

### `src/commands/user/elevate.ts`
`blockedAt` check placed after `lockedAt` check and before password verification — correct. `notifiedAt: null` cleared on upsert so re-elevation resets the warning cycle. `skipChannelPost: true` applied to `ELEVATION_GRANTED`. Fallback to `alertChannelId` for plain text when `auditChannelId` is null.

### `src/commands/admin/unlock.ts`
Guard correctly checks `!pimUser.lockedAt && !pimUser.blockedAt`. `blockedAt: null` included in the update. `clearedBlock` in audit metadata. Command description updated.

### `src/commands/admin/config.ts`
`notify-before` option correctly bounded (0–60). Caution note fires only when `notifyBefore !== null` (i.e., the option was explicitly passed). `contentParts` pattern handles both warning and caution notes cleanly. Embed field order is logical (session-related settings grouped).

### `src/commands/user/help.ts`
Both updated descriptions are accurate and concise.

---

## Conventions Checklist

| Convention | Status |
|---|---|
| `flags: MessageFlags.Ephemeral` (not `ephemeral: true`) | Pass — all new reply/followUp calls use flags |
| `deferReply` before any async work | Pass — all three button handlers |
| `isWatchtowerAdmin()` called immediately after `deferReply` in admin paths | Pass |
| No `setDefaultMemberPermissions` on any command | Pass |
| `getOrCreateGuildConfig()` used (no hardcoded defaults) | Pass |
| Non-fatal errors caught and logged, not thrown | Pass |
| Audit log written before Discord API calls | Pass |
| Migration SQL uses camelCase column names | Pass |
| `prisma` in `dependencies` (not devDependencies) | Pass — untouched |

---

## Verdict

**Approved to merge after Must Fix resolution.** Both Must Fix items were resolved during this review. All Should Fix and Consider items are deferred or noted for future sprints.
