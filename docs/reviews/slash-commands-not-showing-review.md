# Code Review: BUG-001 Fix — Slash Commands Not Showing in Discord

**Date:** 2026-03-08
**Reviewer:** Code Reviewer (Agile Orchestrator cycle)
**PR Scope:** `src/deploy-commands.ts`, `docker-compose.yml`, `.env.example`, `tests/regression/deploy-commands-env.test.js`, `package.json`

---

## Overall Assessment

The fix is correct, minimal, and safe. It addresses both the primary cause (commands never registered with Discord) and the secondary blocker (shared env validator requiring `DATABASE_URL` even though the deploy-commands script never touches the database). No unnecessary changes were made to working code.

---

## Must Fix

None. No blocking issues.

---

## Should Fix

### S1 — `token as string` and `clientId as string` type assertions (deploy-commands.ts, lines 41, 46, 49)

The type assertions are necessary because TypeScript cannot track that `process.exit(1)` is a never-return through the `if (!token)` guard. The assertions are correct at runtime but bypass the type system.

A cleaner alternative is to restructure the guards to reassign into narrowed `const` values:

```ts
const token: string = process.env.DISCORD_TOKEN ?? (() => {
  console.error("[deploy-commands] DISCORD_TOKEN is required.");
  process.exit(1);
})();
```

This uses the `never` return type of `process.exit` to narrow without assertions. However, this is a style preference — the current `as string` approach is safe given the guards immediately above. Acceptable to leave as-is for now.

### S2 — `deploy-commands` service in docker-compose.yml does not depend on `db`

The `deploy-commands` service has no `depends_on` clause. This is correct for now since the registration script does not need the database. It is worth noting in comments that if the script ever needs DB access in the future (e.g., to read guild configs and do targeted registration), a `depends_on` clause will need to be added. The current comment addresses this adequately.

### S3 — `restart: "no"` in docker-compose.yml

`restart: "no"` with the quoted string is correct for Compose v3 but worth noting: some Compose implementations treat the bare unquoted value `no` as a YAML boolean `false`. Quoting it as `"no"` is the right call and matches Docker documentation. No change needed.

---

## Consider

### C1 — Add a success log line that names the registered commands

Currently the script logs `Deployed 7 command(s)...` but does not list their names. Adding a list of command names would make it much easier to verify that the right set of commands was registered, especially during CI or Portainer re-deploys where you are reading logs from a dashboard.

### C2 — Regression test runs against `dist/` (compiled output)

The test calls `npm run build` first via the `test:regression` script, which is correct. However, if someone runs `node tests/regression/deploy-commands-env.test.js` directly without building first, they get a confusing `ENOENT` on `dist/deploy-commands.js`. A wrapper in the test that checks for the file and prints a human-readable error would improve DX.

### C3 — No test for the "zero commands found" case

If `walkDir` finds no command files (e.g., `dist/commands/` directory is missing), the script calls the Discord API with an empty array, which clears all registered commands. A guard that exits non-zero when `commands.length === 0` would prevent accidental command wipes. This is a future improvement, not related to BUG-001.

---

## Security Notes

- No secrets are logged at any point in the fix.
- The `token` variable is passed only to `new REST().setToken()` — never written to stdout/stderr.
- The Docker Compose environment block uses variable substitution (`${DISCORD_TOKEN}`) correctly — the token is never hardcoded.

---

## Files Changed

| File | Change | Assessment |
|---|---|---|
| `src/deploy-commands.ts` | Removed `lib/env` import; added inline token/clientId guards | Correct and minimal |
| `docker-compose.yml` | Added `deploy-commands` one-shot service | Correct; `restart: "no"` is idiomatic |
| `.env.example` | Clarified `DISCORD_GUILD_ID` comment | Helpful, no functional change |
| `tests/regression/deploy-commands-env.test.js` | New regression test | Good coverage of the regression path; zero new dependencies |
| `package.json` | Added `test:regression` script | Correct; runs build first |

---

## Verdict

Approved. All Must Fix items: none. Should Fix items are minor style concerns that do not affect correctness or security. The fix can be merged and redeployed.
