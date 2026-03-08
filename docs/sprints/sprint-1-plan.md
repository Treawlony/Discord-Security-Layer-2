# Sprint 1 Plan: /help Command

Sprint goal: Deliver a production-ready `/help` slash command that explains
the PIM concept and lists all commands, grouped by audience.

Sprint duration: 1 day (feature is small and self-contained).

---

## Stories in Sprint

| Story | Points | Owner |
|---|---|---|
| US-01: Regular user discovers commands | 1 | Frontend/Full-stack dev |
| US-02: Admin sees admin commands | 1 | (covered by same task as US-01) |
| US-03: Auto-discovery, no config needed | 0 | (covered by file placement) |

Total: 2 story points.

---

## Task Breakdown

### TASK-01: Create `src/commands/user/help.ts`
- Estimate: 30 min
- Owner: Developer
- Dependencies: None
- Acceptance: File exports `data` and `execute`; command name is `help`;
  embed includes PIM description, Getting Started, User Commands, Admin
  Commands; reply is ephemeral; `deferReply` is called first.

### TASK-02: TypeScript type-check
- Estimate: 5 min
- Owner: Developer
- Dependencies: TASK-01
- Acceptance: `npm run typecheck` exits 0.

### TASK-03: Lint check
- Estimate: 5 min
- Owner: Developer
- Dependencies: TASK-01
- Acceptance: `npm run lint` exits 0.

### TASK-04: Write unit test for embed content
- Estimate: 20 min
- Owner: QA Engineer
- Dependencies: TASK-01
- Acceptance: Test verifies embed title, field names, and that all 8
  command names appear in the serialised embed.

### TASK-05: Security review
- Estimate: 10 min
- Owner: Security Engineer
- Dependencies: TASK-01
- Acceptance: No OWASP findings on a static, input-free command.

### TASK-06: Code review
- Estimate: 10 min
- Owner: Code Reviewer
- Dependencies: TASK-01 through TASK-05
- Acceptance: No Must Fix items.

### TASK-07: Update CLAUDE.md — Adding New Commands note
- Estimate: 5 min
- Owner: Technical Writer
- Dependencies: TASK-01
- Acceptance: CLAUDE.md reminder added to update `help.ts` when new
  commands are added.

### TASK-08: Update CHANGELOG
- Estimate: 5 min
- Owner: Technical Writer
- Dependencies: TASK-01
- Acceptance: CHANGELOG entry added.

### TASK-09: Deployment checklist
- Estimate: 5 min
- Owner: DevOps Engineer
- Dependencies: TASK-01
- Acceptance: No new env vars, no migration, confirm "Pull and redeploy"
  in Portainer is sufficient.

---

## Implementation Order

```
TASK-01  (implementation)
    |
    +--TASK-02 (typecheck)
    +--TASK-03 (lint)
    |
TASK-04 (tests) -- depends on TASK-01
TASK-05 (security) -- depends on TASK-01
    |
TASK-06 (code review) -- depends on all above
    |
    +--TASK-07 (docs)
    +--TASK-08 (changelog)
    +--TASK-09 (deployment)
```

---

## Risks

| Risk | Impact | Probability | Mitigation |
|---|---|---|---|
| `EmbedBuilder` field character limits hit | Low | Low | Content is short; verify at implementation |
| Lint rule conflicts with `_client` naming | Low | Low | Convention used in `config.ts` already (`_client`) |
| Global command propagation delay | Low | Certain | Document in deploy checklist; expect ~1 hour |
