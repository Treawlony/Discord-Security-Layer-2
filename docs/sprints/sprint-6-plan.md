# Sprint 6 Plan — Discord Embed Notification System

**Epic:** EPIC-006
**Sprint Goal:** Convert all Discord Watchtower channel-posted messages from plain-text to rich embeds, restoring `<@userId>` mentions for readability without triggering notification pings.
**Target Version:** v1.1.0
**Branch:** develop

---

## Task Breakdown

### TASK-6-01: Create `src/lib/embeds.ts` — Shared Embed Builder
**Story:** 1
**Estimate:** 1.5h
**Owner:** backend-developer

- Export colour constants: GREEN, ORANGE, RED, GREY
- Implement 9 pure builder functions (one per embed template)
- Import `EmbedBuilder` and `AuditEventType` from discord.js / @prisma/client
- Implement private `eventTypeColor` and `eventTypeLabel` helpers for the generic audit embed
- Add `<@userId>` mentions in all descriptions/fields (never in `content`)
- All builders call `.setTimestamp()`

**Dependencies:** None — can start immediately.

---

### TASK-6-02: Update `src/lib/audit.ts` — Default Channel Post → Embed
**Story:** 2
**Estimate:** 0.5h
**Owner:** backend-developer

- Import `buildAuditLogEmbed` from `embeds.ts`
- Replace `channel.send(content: string)` with `channel.send({ embeds: [buildAuditLogEmbed(...)] })`
- Remove `eventTypeEmoji` usage from the send call (now handled inside the builder)
- Keep `eventTypeEmoji` export intact (used in tests)
- All other logic unchanged

**Dependencies:** TASK-6-01 must be complete.

---

### TASK-6-03: Update `src/commands/user/elevate.ts` — Elevation Granted Embeds
**Story:** 3
**Estimate:** 0.5h
**Owner:** backend-developer

- Import `buildElevationGrantedAuditEmbed`, `buildElevationGrantedAlertEmbed`
- Replace audit channel `channel.send({ content: ... })` with embed send
- Replace alert channel `channel.send({ content: ... })` with embed send
- Button components unchanged
- `auditMessageId` / `alertMessageId` storage unchanged

**Dependencies:** TASK-6-01 must be complete.

---

### TASK-6-04: Update `src/jobs/expireElevations.ts` — Expiry Warning Embeds
**Story:** 4
**Estimate:** 0.5h
**Owner:** backend-developer

- Import `buildExpiryWarningAlertEmbed`, `buildExpiryWarningAuditEmbed`
- Replace alert channel warning send with embed send
- Replace audit channel warning send with embed send
- Expiry scan message edits (`components: []`) unchanged
- `skipChannelPost: true` unchanged

**Dependencies:** TASK-6-01 must be complete.

---

### TASK-6-05: Update `src/lib/buttonHandlers.ts` — Session-End + Extend Embeds
**Story:** 5, 6
**Estimate:** 1h
**Owner:** backend-developer

- Import all needed builders from `embeds.ts`
- `handleExtendSession`: edit warning message with `buildExtendedSessionEmbed` + `content: ""` + disabled row
- `handleSelfRevoke`: edit audit message with `buildSelfRevokedAuditEmbed` + `content: ""` + `components: []`
- `handleRemovePerm`: edit audit message with `buildAdminRevokedAuditEmbed` + `content: ""` + `components: []`
- `handleRemovePermBlock`: edit audit message with `buildAdminRevokedBlockedAuditEmbed` + `content: ""` + `components: []`
- Alert channel edits remain `{ components: [] }` only

**Dependencies:** TASK-6-01 must be complete.

---

### TASK-6-06: Write `tests/embed-notifications.test.ts`
**Story:** 7
**Estimate:** 1h
**Owner:** qa-engineer

- Source-level tests for `embeds.ts` (exports, colour constants, mention format)
- Source-level tests for all 4 modified files (EmbedBuilder usage, `content: ""` in edits)
- Regression tests: existing structural assertions re-verified for modified files
- Run full test suite; confirm all 278 + new tests pass

**Dependencies:** TASK-6-01 through TASK-6-05 must be complete.

---

### TASK-6-07: Typecheck + Lint
**Estimate:** 0.25h
**Owner:** backend-developer

- `npm run typecheck` — zero errors
- `npm run lint` — zero new warnings

**Dependencies:** All implementation tasks complete.

---

### TASK-6-08: Documentation + CHANGELOG
**Estimate:** 0.5h
**Owner:** technical-writer

- Add v1.1.0 entry to `CHANGELOG.md`
- Update `HOWTO.md` if any operational notes needed
- No README changes required (no new setup steps)

**Dependencies:** TASK-6-06 (tests pass).

---

## Implementation Order (Critical Path)

```
TASK-6-01 (embeds.ts)
    │
    ├── TASK-6-02 (audit.ts)      ──┐
    ├── TASK-6-03 (elevate.ts)    ──┤
    ├── TASK-6-04 (expireElevations.ts) ──┤──► TASK-6-06 (tests) ──► TASK-6-07 (typecheck) ──► TASK-6-08 (docs)
    └── TASK-6-05 (buttonHandlers.ts) ──┘
```

Tasks 6-02 through 6-05 can run in parallel once 6-01 is complete.

---

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Existing source-level tests break due to string changes | Medium | Medium | Review every existing test assertion against new code before committing |
| `content: ""` not clearing old plain-text on edit | Low | Low | Verified Discord API behaviour; include in code review checklist |
| Embed character limits exceeded | Very Low | Low | All field values are Discord-native (short IDs, role names); safe by design |
| `eventTypeEmoji` still needed post-refactor | Low | Low | Keep export intact; only the `channel.send` call changes |

---

## Definition of Done

- [ ] `src/lib/embeds.ts` created with 9 exported builders and 4 colour constants
- [ ] All 4 existing files updated to use embed builders
- [ ] `npm run typecheck` passes with zero errors
- [ ] `npm run test` passes (all existing 278 + new tests)
- [ ] `npm run lint` passes with zero new errors
- [ ] `CHANGELOG.md` updated with v1.1.0 entry
- [ ] All changes committed to `develop` branch
