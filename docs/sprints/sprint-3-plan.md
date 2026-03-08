# Sprint 3 Plan: Role Expiry Notifications

**Epic:** EPIC-003
**Sprint:** 3
**Date:** 2026-03-08
**Goal:** Deliver the complete Role Expiry Notifications feature — schema, warning cron, interactive buttons, config extension, block mechanism, and all associated audit logging.

---

## Stories in Sprint

| Story | Points |
|---|---|
| STORY-008: DB migration | 2 |
| STORY-001: Warning message to audit channel | 3 |
| STORY-002: Extend Session button | 3 |
| STORY-003: Elevation-granted buttons | 3 |
| STORY-004: Remove Permission handler | 2 |
| STORY-005: Remove Permission and Block handler | 2 |
| STORY-006: Block enforcement + unlock update | 2 |
| STORY-007: Config + help update | 1 |

**Total:** 18 story points

---

## Task Breakdown

### TASK-01: Prisma schema + migration SQL
**Story:** STORY-008
**Estimate:** 30 min
**Dependencies:** None (must complete first)

- Add `notifyBeforeMin Int @default(5)` to `GuildConfig`
- Add `notifiedAt DateTime?` to `ActiveElevation`
- Add `blockedAt DateTime?` to `PimUser`
- Add 5 new `AuditEventType` enum values
- Write `prisma/migrations/<ts>_add_expiry_notifications/migration.sql`
- Run `npm run db:generate` to regenerate Prisma client

---

### TASK-02: Audit emoji map (`audit.ts`)
**Story:** STORY-003
**Estimate:** 5 min
**Dependencies:** TASK-01 (new enum values must exist in generated client)

- Add emoji entries for all 5 new event types

---

### TASK-03: Button handlers (`src/lib/buttonHandlers.ts`)
**Story:** STORY-002, STORY-004, STORY-005
**Estimate:** 60 min
**Dependencies:** TASK-01

- `handleExtendSession`: auth check (user ID match), reset expiresAt + clear notifiedAt, audit log, ephemeral reply, update original message
- `handleRemovePerm`: deferReply, admin check, remove role, delete record, audit log, update original message
- `handleRemovePermBlock`: deferReply, admin check, remove role, delete record, set blockedAt, two audit logs, update original message

---

### TASK-04: Button routing in `interactionCreate.ts`
**Story:** STORY-002, STORY-004, STORY-005
**Estimate:** 15 min
**Dependencies:** TASK-03

- Add `isButton()` branch before `isChatInputCommand()` branch
- Route `extend_session:`, `remove_perm_block:`, `remove_perm:` (check block variant first)
- Silently ignore unknown button IDs

---

### TASK-05: Warning scan in `expireElevations.ts`
**Story:** STORY-001
**Estimate:** 45 min
**Dependencies:** TASK-01, TASK-02

- Extract `runWarningScan(client)` function
- Query guild configs with `notifyBeforeMin > 0` and `auditChannelId != null`
- Find elevations in warning window with `notifiedAt: null`
- Post warning message with Extend Session button
- Set `notifiedAt` regardless of post success
- Write `ELEVATION_EXPIRY_WARNING` audit log

---

### TASK-06: `elevate.ts` updates
**Story:** STORY-003, STORY-006
**Estimate:** 30 min
**Dependencies:** TASK-01, TASK-03

- Add `blockedAt` check after `lockedAt` check
- On role grant: post to `auditChannelId` with Remove Permission + Remove Permission and Block buttons
- Fallback to `alertChannelId` plain text if `auditChannelId` null

---

### TASK-07: `unlock.ts` update
**Story:** STORY-006
**Estimate:** 20 min
**Dependencies:** TASK-01

- Clear `blockedAt: null` in the pimUser update
- Relax guard to: `if (!pimUser.lockedAt && !pimUser.blockedAt)` → return error
- Add `clearedBlock` to audit metadata

---

### TASK-08: `config.ts` update
**Story:** STORY-007
**Estimate:** 20 min
**Dependencies:** TASK-01

- Add `notify-before` integer option (0–60)
- Read and persist `notifyBeforeMin`
- Add "Expiry Warning" field to embed
- Add caution note when `notifyBeforeMin > sessionDurationMin`

---

### TASK-09: `help.ts` update
**Story:** STORY-007
**Estimate:** 5 min
**Dependencies:** None

- Update `/watchtower-config` description to mention expiry warning

---

### TASK-10: TypeScript type-check
**Story:** All
**Estimate:** 10 min
**Dependencies:** TASK-01 through TASK-09

- Run `npm run typecheck`; fix any errors

---

## Implementation Order

```
TASK-01 (schema + migration)
  ├─> TASK-02 (audit emoji)           [can run after TASK-01]
  ├─> TASK-03 (button handlers)       [depends on TASK-01]
  │     └─> TASK-04 (routing)         [depends on TASK-03]
  ├─> TASK-05 (warning scan)          [depends on TASK-01, TASK-02]
  ├─> TASK-06 (elevate.ts)            [depends on TASK-01, TASK-03]
  ├─> TASK-07 (unlock.ts)             [depends on TASK-01]
  └─> TASK-08 (config.ts)             [depends on TASK-01]
TASK-09 (help.ts)                     [independent]
TASK-10 (typecheck)                   [final gate — after all above]
```

---

## Risks

| Risk | Mitigation |
|---|---|
| PostgreSQL `ALTER TYPE ADD VALUE` in migration | Supported natively; no workaround needed |
| `interaction.update()` fails on deleted messages | Wrap in try/catch; non-fatal |
| Button 3s Discord acknowledgement window | Always `deferReply` before any async DB work |
| `startsWith("remove_perm:")` matches both variants | Check `remove_perm_block:` first in router |

---

## Definition of Done

- `npm run typecheck` passes with zero errors
- All 5 new audit event types have emoji mappings
- Migration SQL uses camelCase column names
- No `ephemeral: true` used anywhere (all uses are `flags: MessageFlags.Ephemeral`)
- All button handlers `deferReply` before async work
- `/watchtower-unlock` clears both `lockedAt` and `blockedAt`
- `/elevate` checks `blockedAt` after `lockedAt`
