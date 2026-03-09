# Code Review: Discord Embed Notification System (EPIC-006)

**Reviewer:** code-reviewer
**Date:** 2026-03-09
**Branch:** develop
**Commits in scope:** embed-notification refactor

---

## Files Reviewed

| File | Status |
|---|---|
| `src/lib/embeds.ts` (new) | Reviewed |
| `src/lib/audit.ts` | Reviewed |
| `src/commands/user/elevate.ts` | Reviewed |
| `src/jobs/expireElevations.ts` | Reviewed |
| `src/lib/buttonHandlers.ts` | Reviewed |
| `tests/embed-notifications.test.ts` (new) | Reviewed |
| `tests/expiry-notifications.test.ts` | Reviewed (1 assertion updated) |

---

## Must Fix

None.

---

## Should Fix

None.

---

## Consider (non-blocking, future improvement opportunities)

### C-01 — `embeds.ts` circular import structure
`embeds.ts` imports `eventTypeEmoji` from `audit.ts`, while `audit.ts` imports
`buildAuditLogEmbed` from `embeds.ts`. This is a circular dependency. TypeScript and
Node.js handle the common cases of circular module references at runtime (since the
referenced names are functions, not values needed at module init time), so this works
correctly today. For long-term maintainability, consider extracting `eventTypeEmoji`
and `eventTypeLabel` to a small `src/lib/auditHelpers.ts` module that both `audit.ts`
and `embeds.ts` can import without circularity.

### C-02 — `(GREEN_TYPES as string[]).includes(type)` cast in `eventTypeColor`
The TypeScript cast is needed because `Array.prototype.includes` on a typed array
does not accept a supertype argument without a widening cast. This is a known TS
limitation. The current cast is correct and safe. A cleaner alternative is to use
a `Set<AuditEventType>` directly: `new Set<AuditEventType>([...]).has(type)`.
The `Set.has` signature accepts `AuditEventType` without a cast.

### C-03 — `expiryUnix` variable retained in `elevate.ts`
The `expiryUnix` local variable (line 215) is now only used by the ephemeral reply at
the bottom of the function. Its declaration is still correct but it could be inlined at
the single call site. Low priority — no correctness impact.

### C-04 — Expiry scan message edits preserve old embed on `auditMessageId` edit
By design, the expiry scan edits both channel messages with `{ components: [] }` only,
preserving the original elevation-granted embed as a historical record. This is correct
per the architecture spec. It means messages posted before this deploy (plain-text v1.0.0
format) will also have their buttons stripped, leaving the old plain-text content visible
permanently. This is acceptable and self-corrects for all sessions started after this
deploy. No action needed — documented here for awareness.

---

## Positive Observations

1. **`embeds.ts` is pure.** All 9 builder functions are side-effect-free — no I/O, no
   DB calls, no Discord API calls. This makes them trivially testable and safe to call
   in any context.

2. **Consistent `.setTimestamp()` on all builders.** Every embed shows a footer
   timestamp, giving admins/users precise timing context on every event.

3. **`content: ""` on edits is defensive and correct.** Sessions created before this
   deploy had plain-text `content` on their channel messages. The explicit clear prevents
   stale `v1.0.0` content persisting alongside the new embed on button clicks.

4. **Alert message edits (session-end) remain `{ components: [] }` only.** The original
   elevation-granted embed is preserved in place — the button removal alone communicates
   the session is over. This is the correct UX for the alert channel.

5. **Test coverage is thorough.** 87 new test assertions cover all 9 builders, all 4
   modified callers, the no-ping guarantee, and structural regressions.

6. **Existing test suite unbroken.** The one failing assertion in
   `expiry-notifications.test.ts` was correctly addressed by broadening the test scope
   to include `embeds.ts`, not by weakening the assertion.

7. **Zero typecheck errors, zero lint errors/warnings in new code.** Pre-existing lint
   warnings in unrelated files (`commandLoader.ts`, `index.ts`) are unchanged.

---

## Verdict

**APPROVED.** No must-fix items. Three consider items are minor and deferred to a
future cleanup sprint. The implementation is correct, consistent with the CLAUDE.md
conventions, and well-covered by tests.
