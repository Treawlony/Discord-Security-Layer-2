# Sprint 4 Plan — Self-Service Password Reset via Admin

**Epic:** PIM-003
**Sprint:** 4
**Date:** 2026-03-09
**Target version:** v0.2.0

---

## Sprint Goal

Deliver a fully auditable, admin-driven password-reset command so that no PIM recovery workflow requires direct database access.

---

## Task Breakdown

### TASK-01 — Schema: make `passwordHash` nullable
**Story:** STORY-02
**Estimate:** 1 point
**Dependencies:** None — first task, all others depend on it

Steps:
1. Edit `prisma/schema.prisma`: change `passwordHash String` to `passwordHash String?`
2. Add `PASSWORD_RESET` to the `AuditEventType` enum in `schema.prisma`
3. Create migration directory `prisma/migrations/20260309000000_nullable_password_hash/`
4. Write `migration.sql` with `DROP NOT NULL` and `ALTER TYPE ADD VALUE`
5. Run `npm run db:generate` to regenerate the Prisma client

**Risk:** None — non-destructive migration on an existing column.

---

### TASK-02 — New command: `src/commands/admin/reset-password.ts`
**Story:** STORY-01
**Estimate:** 2 points
**Dependencies:** TASK-01 (Prisma client must expose `passwordHash` as `string | null` and `PASSWORD_RESET` enum value)

Steps:
1. Create `src/commands/admin/reset-password.ts`
2. Define `SlashCommandBuilder` with name `watchtower-reset-password`, description, and required `user` option
3. Implement `execute`: deferReply → admin check → target lookup → update → audit log → editReply
4. Confirm command is auto-discovered (no manual registration step needed per CLAUDE.md)

**Risk:** Low — follows an identical pattern to `unlock.ts`.

---

### TASK-03 — Guard in `/elevate` for null password hash
**Story:** STORY-03
**Estimate:** 1 point
**Dependencies:** TASK-01 (type of `passwordHash` must be `string | null` for TypeScript to surface the null check requirement)

Steps:
1. Read current `src/commands/user/elevate.ts` (file has been modified since design — read before editing)
2. Insert null-password guard after `blockedAt` check, before `verifyPassword` call
3. Verify TypeScript narrowing resolves the compile error on `verifyPassword(password, pimUser.passwordHash)`

**Risk:** Low — a single guard block insertion. TypeScript type narrowing guarantees correctness.

---

### TASK-04 — Audit emoji for `PASSWORD_RESET`
**Story:** STORY-01 (supporting)
**Estimate:** 0.5 points
**Dependencies:** TASK-01 (enum value must exist in schema before client is generated)

Steps:
1. Read `src/lib/audit.ts`
2. Add `PASSWORD_RESET: "🔑"` to the `eventTypeEmoji` map

**Risk:** None.

---

### TASK-05 — Update `/help` embed
**Story:** STORY-05
**Estimate:** 0.5 points
**Dependencies:** TASK-02 (command must exist before documenting it)

Steps:
1. Read `src/commands/user/help.ts`
2. Add `/watchtower-reset-password` line to the Admin Commands field, after `/watchtower-unlock`

**Risk:** None.

---

### TASK-06 — Type-check full project
**Story:** Cross-cutting
**Estimate:** 0.5 points
**Dependencies:** TASK-01, TASK-02, TASK-03, TASK-04, TASK-05

Steps:
1. Run `npm run typecheck`
2. Resolve any type errors surfaced

**Risk:** Low — the null narrowing in TASK-03 is the only type-sensitive change.

---

### TASK-07 — QA: unit + integration tests
**Story:** Cross-cutting
**Estimate:** 2 points
**Dependencies:** TASK-01 through TASK-06

Steps:
1. Write tests for `reset-password.ts` command (admin gate, no PIM account, success path, idempotent double-reset)
2. Write tests for the null-password guard in `elevate.ts`
3. Write a test confirming `set-password` continues to work when `passwordHash` is null
4. Run test suite and confirm all pass

**Risk:** Low — test patterns follow existing command tests.

---

### TASK-08 — Security review
**Story:** Cross-cutting
**Estimate:** 1 point
**Dependencies:** TASK-07

Steps:
1. Review new command for OWASP Top 10 exposure
2. Verify guild isolation, auth gate, audit completeness
3. Document findings

---

### TASK-09 — Code review
**Story:** Cross-cutting
**Estimate:** 1 point
**Dependencies:** TASK-08

Steps:
1. Review all changed files
2. Categorise findings: Must Fix / Should Fix / Consider
3. Resolve Must Fix items

---

### TASK-10 — Documentation + deployment prep
**Story:** Cross-cutting
**Estimate:** 1 point
**Dependencies:** TASK-09

Steps:
1. Update `CHANGELOG.md` with v0.2.0 entry
2. Write deployment checklist (migration step is the main concern)

---

## Implementation Order

```
TASK-01 (schema + migration)
    |
    +---> TASK-02 (new command)    \
    |                               \
    +---> TASK-03 (elevate guard)   +---> TASK-06 (typecheck)
    |                               /         |
    +---> TASK-04 (audit emoji)   -/          |
    |                                         |
    +---> TASK-05 (help embed)  ------------ /
                                              |
                                         TASK-07 (QA)
                                              |
                                         TASK-08 (Security)
                                              |
                                         TASK-09 (Code Review)
                                              |
                                         TASK-10 (Docs + Deploy)
```

TASK-01 must complete first. TASK-02 through TASK-05 can proceed in parallel once TASK-01 is done. TASK-06 gates all quality phases.

---

## Velocity / Estimates

| Task | Points |
|---|---|
| TASK-01 | 1.0 |
| TASK-02 | 2.0 |
| TASK-03 | 1.0 |
| TASK-04 | 0.5 |
| TASK-05 | 0.5 |
| TASK-06 | 0.5 |
| TASK-07 | 2.0 |
| TASK-08 | 1.0 |
| TASK-09 | 1.0 |
| TASK-10 | 1.0 |
| **Total** | **10.5** |

---

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Prisma client not regenerated before implementing TASK-02/03 | Low | High (type errors) | TASK-01 explicitly includes `db:generate` as its final step |
| `elevate.ts` has changed since design phase | Known | Medium | TASK-03 explicitly requires reading the current file before editing |
| Migration timestamp collision with existing migrations | Low | Low | Timestamp `20260309000000` is one day after the latest (`20260308000002`) |
| PostgreSQL enum value removal needed for rollback | Low | Low | Accepted — documented in architecture doc |
