# Bug Report: Slash Commands Not Showing in Discord

**ID:** BUG-001
**Date:** 2026-03-08
**Severity:** Critical — the bot is entirely non-functional from the user's perspective
**Status:** Resolved (see Fix section)

---

## Summary

All 7 slash commands defined in the Discord Watchtower codebase are invisible to Discord users. Typing `/` in any channel where the bot is present produces no suggestions for any Watchtower commands. The bot process itself starts successfully and logs in, which masks the real problem.

---

## Environment

| Item | Value |
|---|---|
| Bot tag | C14A PIM#5261 |
| Runtime | Node.js 20 / TypeScript 5 |
| Discord library | discord.js v14 |
| Deployment | Docker + Portainer GitOps |
| Commands discovered at runtime | 7 (all load successfully) |

---

## Root Cause (Primary)

`deploy-commands.ts` — the one-shot script that registers slash commands with the Discord API — **has never been executed against the current codebase** in this deployment environment. Discord requires commands to be explicitly registered via the REST API (`PUT /applications/{clientId}/commands` or its guild-scoped variant) before they appear in any client. Loading commands into `client.commands` at bot startup is a separate, runtime-only concern for *dispatching* interactions; it has no effect on command *visibility* in the Discord UI.

**The two systems are entirely independent:**

| Concern | Mechanism | When it runs |
|---|---|---|
| Command registration (makes commands appear in Discord) | `deploy-commands.ts` via Discord REST API | Must be run once per deployment, or whenever commands change |
| Command dispatch (executes commands when a user invokes one) | `interactionCreate` event + `client.commands` collection | Every time the bot process starts |

Because `deploy-commands.ts` was never run after the current commands were written, Discord has zero knowledge that these commands exist.

---

## Root Cause (Secondary — Dockerfile)

The `Dockerfile` `CMD` only runs `prisma migrate deploy && node dist/index.js`. There is **no step** in the build pipeline or container startup that calls the deploy-commands registration script. In a Portainer GitOps workflow, pulling and redeploying the stack will never automatically re-register commands.

---

## Reproduction Steps

1. Clone the repository and configure `.env` with valid credentials.
2. Run `docker compose up -d` — the bot starts and logs `Logged in as C14A PIM#5261`.
3. In any Discord channel the bot has access to, type `/` — no Watchtower commands appear.
4. Check bot logs — all 7 commands load fine: `[Commands] Loaded 7 command(s)`.
5. The Discord UI still shows nothing, because the REST registration step was skipped.

---

## Expected Behavior

After deploying the bot for the first time (or after any change to command definitions), running `npm run deploy-commands` registers all commands with the Discord API. Within seconds (guild-scoped) or up to one hour (global), the commands appear in the Discord UI autocomplete.

## Actual Behavior

Commands never appear in the Discord UI because the registration script has never been executed.

---

## Affected Files

| File | Role | Issue |
|---|---|---|
| `src/deploy-commands.ts` | Command registration script | Never executed in this environment |
| `Dockerfile` | Container startup | Does not call the registration script |
| `docker-compose.yml` | Service definition | No deploy-commands service or entrypoint hook |

---

## Fix

Two coordinated changes are required:

### Fix 1 — Add a one-shot `deploy` service to `docker-compose.yml`

Add a dedicated service that runs `node dist/deploy-commands.js` on stack start. Marking it `restart: "no"` ensures it runs once and exits cleanly. The `bot` service already has a dependency on `db`; the deploy service should share the same dependency so the database is available if the script ever needs it.

### Fix 2 — Copy `deploy-commands.ts` output into the production Docker image

The `Dockerfile` builder stage compiles `src/` into `dist/`, which includes `deploy-commands.ts` → `dist/deploy-commands.js`. The runner stage copies `./dist` entirely, so `dist/deploy-commands.js` is already present in the image — no Dockerfile change is strictly required. The gap is purely in `docker-compose.yml` not calling it.

### Manual fix (immediate, no rebuild needed)

From the developer's machine with `.env` populated:

```bash
# For development (instant, guild-scoped)
DISCORD_GUILD_ID=your_guild_id npm run deploy-commands

# For production (global, up to 1 hour propagation)
npm run deploy-commands
```

---

## Acceptance Criteria

1. After running the fix, typing `/watchtower` or `/elevate` or `/set-password` in Discord shows the correct commands in the autocomplete menu.
2. A fresh `docker compose up -d` on a clean environment automatically registers all commands without any manual step.
3. Re-running the registration script is idempotent — running it twice produces no errors and does not duplicate commands.

---

## Notes

- `DISCORD_GUILD_ID` is intentionally excluded from the Portainer production environment variables (per CLAUDE.md). Production deployments should register globally (no guild ID), accepting the up-to-1-hour propagation delay.
- The `deploy-commands.ts` script is already safe to run against a built image: it reads `DISCORD_TOKEN` and `DISCORD_CLIENT_ID` from environment and uses only the Discord REST API — no database connection required.
- The `env.ts` validator requires `DATABASE_URL` to be present even in the deploy-commands script (because it imports `./lib/env`). This is a minor secondary issue: the deploy-commands service in Docker Compose will need `DATABASE_URL` in its environment even though it never queries the database.
