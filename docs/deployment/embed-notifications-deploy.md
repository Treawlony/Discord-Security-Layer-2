# Deployment Checklist: Discord Embed Notification System (EPIC-006) — v1.1.0

## Pre-Deployment Verification

- [x] `npm run typecheck` — zero errors
- [x] `npm run lint` — zero new errors/warnings in changed files
- [x] `npm test` — 473 tests passing (386 existing + 87 new)
- [x] `CHANGELOG.md` updated with v1.1.0 entry
- [x] All changes committed to `develop` branch

## Schema / Migration

**None required.** This release has no database schema changes.
- No `prisma migrate` run needed on deploy
- No `prisma migrate deploy` step required on Portainer stack update
- Portainer's container CMD (`prisma migrate deploy && node dist/index.js`) will run
  migrate deploy as usual; with no pending migrations it exits immediately (zero impact)

## No New Environment Variables

No new environment variables are required. All existing Portainer stack variables
are unchanged:
- `DISCORD_TOKEN`
- `DISCORD_CLIENT_ID`
- `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB`
- `DEFAULT_LOCKOUT_THRESHOLD` (optional)

## No New Discord Permissions

The existing permission set (Manage Roles, Send Messages, Use Slash Commands) already
covers embed sends. Discord does not require separate permissions for sending embeds.

## Deployment Procedure

### Staging (develop branch)

1. Push `develop` branch to GitHub — Portainer staging stack auto-pulls and rebuilds.
2. Confirm the staging bot comes online (check Portainer container logs for
   `[Bot] Logged in as ...`).
3. In a test guild on the staging bot:
   a. Run `/elevate` and complete the flow — verify the audit channel receives a green
      embed titled "PIM Elevation Granted" with User / Role / Expires fields.
   b. Verify the alert channel receives a green embed titled "Role Elevated" with the
      user mention and Revoke Early button.
   c. Wait for (or shorten `notifyBeforeSec` to trigger) the expiry warning — verify
      the alert channel receives an orange embed titled "Session Expiring Soon".
   d. Click "Revoke Early" — verify the audit channel message is replaced with a grey
      "Session Self-Revoked" embed.
   e. Run a second elevation, then click "Remove Permission" — verify the audit channel
      message is replaced with a red "Permission Removed" embed.
   f. Verify that `<@userId>` mentions in all embeds do NOT trigger a Discord
      notification ping on the mentioned user's device.
4. Confirm no unexpected errors in container logs.

### Production (master branch)

Only after staging confirmation by the user. Per CLAUDE.md and project memory:
- **Never push to master without explicit user instruction.**
- Merge `develop → master` only after user confirms staging bot is working correctly.
- Tag: `git tag v1.1.0 && git push origin v1.1.0` after merge.

## Rollback Plan

If the embed format causes unexpected issues:

1. In Portainer, redeploy the staging stack pinned to the previous commit (last `v1.0.0`
   tag) by specifying the commit hash in the Portainer GitOps configuration.
2. No database rollback needed — this release has no schema changes.
3. Sessions active at rollback time will have embed messages in the channel. After
   rollback, button clicks will still work (button `customId` format is unchanged).
   New sessions will revert to plain-text channel posts.

## Operational Notes

### Messages Posted Before This Deploy

Sessions active at deploy time (created while running v1.0.0) will have plain-text
messages in the channels. When those sessions end:
- **Expiry scan** (`components: []` edit): strips buttons from plain-text messages
  correctly — no embed is sent, old content remains. This is fine.
- **Button-click session end** (self-revoke, admin-revoke): the edit now sends
  `{ embeds: [newEmbed], content: "", components: [] }`. This replaces the old
  plain-text content with the new embed cleanly. `content: ""` clears the stale text.

No manual intervention required for in-flight sessions at deploy time.

### Monitoring

No new metrics or alerts required. The bot's existing logging (`console.error` for
non-fatal channel send failures) covers any embed-send failures the same way it
covered plain-text send failures.

Watch for any `[elevate]`, `[Jobs]` prefix error lines in container logs during the
first few minutes after deploy — these would indicate channel permission issues (not
embed-specific).
