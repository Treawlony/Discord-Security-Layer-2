# Sprint 2 Plan: Watchtower Admin Role

**Sprint:** 2
**Date:** 2026-03-08
**Goal:** Ship the Watchtower Admin Role feature — all five admin commands runtime-gated, admin role configurable, elevation filter in place, audit logs enriched.

---

## Task Breakdown

### T1 — Schema: Add adminRoleId + ADMIN_ROLE_CONFIGURED enum (Story 1)
**Estimate:** 30 min
**Owner:** Backend
**Deliverables:**
- `adminRoleId String?` added to `GuildConfig` in `prisma/schema.prisma`
- `ADMIN_ROLE_CONFIGURED` added to `AuditEventType` enum
- Migration generated and applied
- Prisma client regenerated

**Dependencies:** None — first task
**Risk:** Low. Nullable column addition is non-destructive.

---

### T2 — Library: src/lib/permissions.ts (Story 2)
**Estimate:** 20 min
**Owner:** Backend
**Deliverables:**
- `src/lib/permissions.ts` created with `isWatchtowerAdmin()` export
- Correct bootstrap logic: null adminRoleId → Administrator check; set adminRoleId → role membership ONLY

**Dependencies:** T1 (needs updated GuildConfig type from Prisma client regeneration)
**Risk:** Low. Pure function, no DB or network calls.

---

### T3 — Commands: Runtime guard on assign, revoke, list, unlock (Story 3 + Story 6)
**Estimate:** 45 min
**Owner:** Backend
**Deliverables:**
- `assign.ts`: guard injected, ELIGIBILITY_GRANTED metadata enriched, admin-role assignment warning added
- `revoke.ts`: guard injected, ELIGIBILITY_REVOKED + ELEVATION_REVOKED metadata enriched
- `list.ts`: guard injected (read-only; no audit change)
- `unlock.ts`: guard injected, ACCOUNT_UNLOCKED metadata enriched

**Dependencies:** T1, T2
**Risk:** Low. Pattern is identical across all four files.

---

### T4 — Command: Extend /watchtower-config (Story 4 + Story 6)
**Estimate:** 45 min
**Owner:** Backend
**Deliverables:**
- New `admin-role` role option on SlashCommandBuilder
- Runtime guard injected (same pattern as T3)
- `adminRoleId` persisted to GuildConfig when option provided
- Response embed updated with "Admin Role" field
- `ADMIN_ROLE_CONFIGURED` audit log emitted on change
- Post-update warning message appended

**Dependencies:** T1, T2
**Risk:** Medium. More logic than other commands; embed layout change.

---

### T5 — Command: Elevate role filter (Story 5)
**Estimate:** 20 min
**Owner:** Backend
**Deliverables:**
- `elevate.ts`: eligible roles filtered to exclude adminRoleId after password verification
- Zero-roles-after-filter case handled gracefully

**Dependencies:** T1 (needs updated GuildConfig type)
**Risk:** Low. Single filter line + edge case.

---

### T6 — Tests (QA phase)
**Estimate:** 60 min
**Owner:** QA
**Deliverables:**
- Unit tests for `isWatchtowerAdmin()` — all branches
- Integration test stubs for permission denied path on each admin command
- Test report saved

**Dependencies:** T2 complete
**Risk:** Low.

---

## Implementation Order

```
T1  ──► T2  ──┬──► T3  ┐
              ├──► T4  ├──► T6 (QA)
              └──► T5  ┘
```

T3, T4, T5 can run in parallel after T2 is done.

---

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Prisma migration fails on existing data | Low | High | Column is nullable; no backfill |
| Server owner loses admin access after testing | Low | High | Test on dev guild before production; document bootstrap recovery |
| `interaction.member` type is `GuildMember \| APIInteractionGuildMember` | Medium | Medium | Cast to `GuildMember` — guild slash commands always provide full GuildMember with role cache |

---

## Definition of Done

- [ ] All five admin commands return "permission denied" to a non-admin user
- [ ] Server owner (Administrator, no adminRoleId set) can configure the bot
- [ ] Once adminRoleId is set, Administrator alone is denied
- [ ] Watchtower Admin role absent from /elevate dropdown
- [ ] All admin audit logs carry isWatchtowerAdmin flag
- [ ] TypeScript compiles without errors
- [ ] No regressions on /elevate and /set-password
