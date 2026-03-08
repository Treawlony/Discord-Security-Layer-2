# Deployment Checklist: Role Expiry Notifications (v0.1.0)

**Feature:** role-expiry-notifications
**Date:** 2026-03-08
**Target version:** 0.1.0 (MINOR — new DB fields, new config option, new bot behaviour)

---

## Pre-Deploy Verification (local)

All items below were confirmed passing at time of writing.

| Check | Command | Status |
|---|---|---|
| TypeScript compiles with zero errors | `npm run typecheck` | PASS |
| All 164 tests pass | `npm test` | PASS (164/164) |
| Migration SQL file present | `prisma/migrations/20260308000001_add_expiry_notifications/migration.sql` | Present |
| Migration uses camelCase column names | Manual inspection | Verified |
| Prisma client regenerated from updated schema | `npm run db:generate` | Done |
| No new environment variables required | — | Confirmed |
| No Docker / docker-compose.yml changes required | — | Confirmed |
| `prisma` CLI in `dependencies` (not devDependencies) | `package.json` | Confirmed |

---

## What the migration does

The migration (`20260308000001_add_expiry_notifications`) is **additive only** — no existing data is modified or deleted:

| Table | Change | Effect on existing rows |
|---|---|---|
| `guild_configs` | ADD COLUMN `"notifyBeforeMin" INTEGER NOT NULL DEFAULT 5` | All existing guilds get `notifyBeforeMin = 5` (opted in with sensible default) |
| `active_elevations` | ADD COLUMN `"notifiedAt" TIMESTAMP(3)` | All existing active sessions get `NULL` (not yet warned — will be warned on next qualifying cron tick) |
| `pim_users` | ADD COLUMN `"blockedAt" TIMESTAMP(3)` | All existing users get `NULL` (not blocked) |
| `AuditEventType` enum | ADD VALUE × 5 | No effect on existing rows |

---

## Deployment steps (Portainer GitOps)

1. **Commit and push** all changes to the `master` branch on GitHub (do not force-push).

2. **In Portainer**: navigate to the Watchtower stack → **Pull and redeploy**.

3. **What happens automatically on container startup:**
   - `npx prisma migrate deploy` runs the new migration against the live database.
   - `node dist/index.js` starts the bot.
   - The bot re-registers all slash commands with Discord via the `ready` event.

4. **Verify deployment** via `docker compose logs -f bot` (or Portainer log viewer):
   - Look for: `[Jobs] Elevation expiry job started`
   - Look for: `Ready! Logged in as ...`
   - No `P2022` column-not-found errors.
   - No `PrismaClientInitializationError`.

5. **Verify migration ran** by checking the bot handles `/watchtower-config` without error (it reads `notifyBeforeMin` from the DB — if the column is missing, the command would crash).

---

## Slash command propagation

Discord global commands propagate to all servers within up to **1 hour** after the bot restarts. The changed commands are:

| Command | Change |
|---|---|
| `/watchtower-config` | New `notify-before` integer option added |
| `/watchtower-unlock` | Description updated (no option changes — propagation not strictly required) |

Until propagation completes, existing users may not see the `notify-before` option in the Discord autocomplete for `/watchtower-config`. The command itself works immediately; only the UI hint is delayed.

---

## Post-Deploy smoke tests

Run these manually in a test Discord server after deployment:

| Test | Expected result |
|---|---|
| `/watchtower-config` — view without options | Embed shows "Expiry Warning: 5 min before expiry" |
| `/watchtower-config notify-before:0` | Embed shows "Expiry Warning: Disabled" |
| `/watchtower-config notify-before:10` | Embed shows "Expiry Warning: 10 min before expiry" |
| `/watchtower-config notify-before:90 session-duration:60` | Caution note shown in reply |
| Elevate a user → check audit channel | Message appears with "Remove Permission" and "Remove Permission and Block" buttons |
| Click "Remove Permission" as non-admin | Ephemeral error: "You do not have permission..." |
| Click "Remove Permission" as admin | Role removed; buttons disabled; ephemeral confirmation |
| Click "Remove Permission and Block" as admin | Role removed, user blocked; buttons disabled; ephemeral confirmation |
| `/elevate` as blocked user | Ephemeral error: "Your PIM account has been blocked..." |
| `/watchtower-unlock @blocked-user` | Success; reply notes block cleared |
| `/elevate` as unblocked user | Works normally |
| Set `notify-before:1`, elevate, wait for cron | Warning message appears in audit channel within ~1 min with "Extend Session" button |
| Click "Extend Session" as the elevated user | Timer reset; button disabled; ephemeral confirmation |
| Click "Extend Session" as a different user | Ephemeral error: "Only the elevated user can extend their own session." |

---

## Rollback plan

If the deployment must be reverted:

1. Revert the code to the previous `master` commit and redeploy via Portainer.
2. The new columns (`notifyBeforeMin`, `notifiedAt`, `blockedAt`) and enum values are harmless to the old code — Prisma will simply ignore unknown fields. **No down-migration is needed** for a rollback to be safe at the application level.
3. If the columns must be removed from the DB (e.g. for a clean rollback): connect to the database directly and run:
   ```sql
   ALTER TABLE "guild_configs" DROP COLUMN "notifyBeforeMin";
   ALTER TABLE "active_elevations" DROP COLUMN "notifiedAt";
   ALTER TABLE "pim_users" DROP COLUMN "blockedAt";
   ```
   Note: PostgreSQL does not support removing enum values once added. The five new `AuditEventType` values will remain in the enum but will be unused by the old code.

---

## Monitoring

No new alerting infrastructure is required. The following log lines indicate healthy operation:

- `[Jobs] Elevation expiry job started` — cron job registered at startup
- `[Jobs] Warning scan: failed to post to audit channel for guild ...` — non-fatal; indicates audit channel is misconfigured or bot lacks Send Messages permission in that channel. Admin should run `/watchtower-config audit-channel:#channel` to fix.

Existing monitoring (audit channel, Portainer container health) covers the new feature without changes.

---

## Version tagging (after deploy confirmed healthy)

```bash
git tag v0.1.0
git push origin v0.1.0
```
