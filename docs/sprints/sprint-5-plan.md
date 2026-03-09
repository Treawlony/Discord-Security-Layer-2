# Sprint 5 Plan: v0.4.0 — Operational Improvements & Admin Tooling

## Sprint Goal
Deliver all five v0.4.0 features with zero schema migrations, passing typecheck and lint.

## Task Breakdown & Estimates

### Task 1 — Graceful Shutdown (30 min)
- 1a. Modify `src/jobs/expireElevations.ts`: import `ScheduledTask`, return task handle from `startExpiryJob`
- 1b. Modify `src/index.ts`: add `isShuttingDown` guard, `shutdown()` async function, register SIGTERM/SIGINT handlers after `startExpiryJob` call

### Task 2 — Export `eventTypeEmoji` from audit.ts (5 min)
- 2a. Change `function eventTypeEmoji` to `export function eventTypeEmoji` in `src/lib/audit.ts`
- Dependency: Task 6 (audit command) depends on this

### Task 3 — Rate Limiting on /elevate (20 min)
- 3a. Add `RATE_LIMIT_WINDOW_MS`, `RATE_LIMIT_MAX_ATTEMPTS` constants to `src/commands/user/elevate.ts`
- 3b. Add `elevateCooldowns` Map and `isRateLimited()` helper
- 3c. Insert rate-limit check immediately after `deferReply`

### Task 4 — Bulk Eligibility Assignment (45 min)
- 4a. Update `SlashCommandBuilder` in `src/commands/admin/assign.ts`: rename `role` → `role1`, add `role2`, `role3`
- 4b. Fetch `guild` and `botMember` once before the loop
- 4c. Implement `processRole()` helper with `findUnique` idempotency check
- 4d. Collect, deduplicate, loop roles, build reply string

### Task 5 — `/watchtower-list` Completeness (30 min)
- 5a. Add `activeElevation` query to `src/commands/admin/list.ts`
- 5b. Restructure embed: update title, add eligible-roles section, add active-elevations section
- 5c. Implement footer truncation logic

### Task 6 — `/watchtower-audit` Command (45 min)
- 6a. Create `src/commands/admin/audit.ts` with subcommand builder
- 6b. Implement admin gate, subcommand routing, DB queries
- 6c. Implement `buildAuditEmbed()` with char-limit truncation
- 6d. Update `src/commands/user/help.ts` to document the new command

## Implementation Order
1 → 2 → 3 → 4 → 5 → 6

Tasks 3, 4, 5 have no interdependencies. Task 6 depends on Task 2.

## Risks
- `role` → `role1` rename: Discord propagates global command updates within up to 1 hour. During that window the old command UI may still appear for some users, but discord.js validates options server-side on interaction receipt.
- Embed field cap: active implementation must not exceed 25 fields total (20 assignments + 1 header + 5 elevations = 26 — use inline section labels in field values rather than separate header fields).

## Definition of Done
- All files compile with `npm run typecheck` (zero errors)
- `npm run lint` passes (zero errors)
- All 278 existing tests continue to pass
