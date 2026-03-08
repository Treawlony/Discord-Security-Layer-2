# Deployment Checklist: /help Command

Date: 2026-03-08

## Pre-deployment Checks

- [x] TypeScript compiles cleanly (`npm run typecheck` — exit 0)
- [x] New file lints cleanly (`npx eslint src/commands/user/help.ts` — exit 0)
- [x] All 16 unit tests pass (`npm test` — 16/16)
- [x] Security review complete — no findings
- [x] Code review complete — no Must Fix items
- [x] CLAUDE.md updated with reminder for future command additions
- [x] CHANGELOG.md updated

## Infrastructure Changes

| Item | Change Required | Notes |
|---|---|---|
| docker-compose.yml | None | No new services or environment variables |
| Portainer environment variables | None | No new variables |
| Database migrations | None | No schema changes |
| New npm packages (prod) | None | discord.js EmbedBuilder already present |
| New npm packages (dev) | jest, ts-jest, @types/jest | Dev-only; not included in Docker image |

## Docker Image Impact

The three new dev dependencies (jest, ts-jest, @types/jest) are installed
only as `devDependencies`. The production Dockerfile (if using a multi-stage
build or `npm install --omit=dev`) will not include them in the final image.
Verify the Dockerfile uses `--omit=dev` or equivalent for the production step.

## Deployment Steps (Portainer)

1. Push commits to the GitHub repository's `master` branch.
2. In Portainer, navigate to the Watchtower stack.
3. Click "Pull and redeploy".
4. Verify the bot logs show the updated command count:
   `[Commands] Loaded 8 command(s)` (was 7 before this feature).
5. In Discord, type `/help` — confirm the ephemeral embed appears with
   all three sections (Getting Started, User Commands, Admin Commands).

## Global Command Propagation

Discord propagates global slash command updates within approximately 1 hour.
The `/help` command will become visible to all users in all guilds within
that window. No action required — this is standard Discord behaviour.

## Rollback Plan

If rollback is needed:
1. Delete `src/commands/user/help.ts` from the repository.
2. Push the deletion commit.
3. Pull and redeploy in Portainer.
4. Verify bot logs show `[Commands] Loaded 7 command(s)`.

No database rollback is required (no schema was changed).

## Monitoring

No new monitoring or alerting is required. The existing bot logs will show
errors if `deferReply` or `editReply` fails (caught by `interactionCreate.ts`
error handler). No new runbook entry needed.
