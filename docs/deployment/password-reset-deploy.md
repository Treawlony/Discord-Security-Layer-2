# Deployment Checklist: Self-Service Password Reset via Admin (v0.2.0)

**Feature:** PIM-003 — `/watchtower-reset-password`
**Date:** 2026-03-09
**Target version:** 0.2.0 (MINOR — new command, new DB schema change, new audit event type)

---

## Pre-Deploy Verification (local)

All items below confirmed passing at time of writing.

| Check | Command | Status |
|---|---|---|
| TypeScript compiles with zero errors | `npm run typecheck` | PASS |
| All 257 tests pass | `npm test` | PASS (257/257) |
| Migration SQL file present | `prisma/migrations/20260309000000_nullable_password_hash/migration.sql` | Present |
| Migration uses camelCase column name `"passwordHash"` | Manual inspection | Verified |
| Migration does not use `DROP COLUMN` (non-destructive) | Manual inspection | Verified |
| Prisma client regenerated from updated schema | `npm run db:generate` | Done |
| `PimUser.passwordHash` is `String?` in generated client | Confirmed via typecheck | Verified |
| No new environment variables required | — | Confirmed |
| No `docker-compose.yml` changes required | — | Confirmed |
| No `Dockerfile` changes required | — | Confirmed |
| `prisma` CLI in `dependencies` (not devDependencies) | `package.json` | Confirmed |
| `CHANGELOG.md` updated with v0.2.0 entry | Manual inspection | Done |

---

## What the migration does

The migration (`20260309000000_nullable_password_hash`) is **additive only** — no existing data is modified or deleted.

| Table / Type | Change | Effect on existing rows |
|---|---|---|
| `pim_users` | `ALTER COLUMN "passwordHash" DROP NOT NULL` | All existing non-null hashes remain intact. No data is touched. The column can now also hold `NULL`. |
| `AuditEventType` enum | `ADD VALUE 'PASSWORD_RESET'` | No effect on existing rows or existing enum usages. |

There is no default value change, no column rename, and no table restructuring.

---

## Files changed in this release

| File | Change |
|---|---|
| `prisma/schema.prisma` | `passwordHash String` → `String?`; `PASSWORD_RESET` added to `AuditEventType` |
| `prisma/migrations/20260309000000_nullable_password_hash/migration.sql` | New migration |
| `src/commands/admin/reset-password.ts` | New admin command |
| `src/commands/user/elevate.ts` | Null-password guard inserted |
| `src/lib/audit.ts` | `PASSWORD_RESET` emoji entry added |
| `src/commands/user/help.ts` | `/watchtower-reset-password` added to admin section |
| `tests/password-reset.test.ts` | New test file (40 tests) |
| `tests/admin-guard.test.ts` | `reset-password` added to both command arrays |
| `tests/help-command.test.ts` | Command count updated 8 → 9 |
| `CHANGELOG.md` | v0.2.0 entry added |

---

## Deployment steps (Portainer GitOps)

1. **Commit and push** all changes to the `master` branch on GitHub. Do not force-push.

2. **In Portainer**: navigate to the Watchtower stack → **Pull and redeploy**.

3. **What happens automatically on container startup:**
   - `npx prisma migrate deploy` applies `20260309000000_nullable_password_hash` against the live database.
   - `node dist/index.js` starts the bot.
   - The bot re-registers all slash commands with Discord via the `ready` event, including the new `/watchtower-reset-password` command.

4. **Verify deployment** via `docker compose logs -f bot` (or Portainer log viewer):
   - Look for: `Ready! Logged in as ...`
   - Look for no `P2022` (column-not-found) errors.
   - Look for no `PrismaClientInitializationError`.
   - Look for no `PrismaClientKnownRequestError` mentioning `passwordHash`.

---

## Slash command propagation

Discord global commands propagate to all servers within up to **1 hour** after the bot restarts. The new and changed commands are:

| Command | Change |
|---|---|
| `/watchtower-reset-password` | New command — may not appear in Discord UI for up to 1 hour |
| `/help` | Static embed text updated (no option changes — immediate in the embed response, no propagation delay) |

Until propagation completes, `/watchtower-reset-password` will not appear in Discord's autocomplete. The command is fully functional once the bot has started — the delay is UI-only.

---

## Post-Deploy smoke tests

Run these manually in a test Discord server after deployment.

### New command — happy path

| Step | Action | Expected result |
|---|---|---|
| 1 | Admin runs `/watchtower-reset-password user:@user-with-account` | Ephemeral: `<@user>'s PIM password has been reset. They must run /set-password before they can elevate again.` |
| 2 | Check audit channel | `🔏 \`PASSWORD_RESET\` — <@user> — just now` |
| 3 | Affected user runs `/elevate password:anything` | Ephemeral: `Your PIM password has been reset by an administrator. Please run /set-password to set a new password before you can elevate.` |
| 4 | Affected user runs `/set-password password:NewP@ss1` | Ephemeral: `Your PIM password has been updated.` |
| 5 | Affected user runs `/elevate password:NewP@ss1` | Role select menu appears; elevation succeeds |

### Error cases

| Step | Action | Expected result |
|---|---|---|
| 6 | Non-admin runs `/watchtower-reset-password user:@anyone` | Ephemeral: `You do not have permission to use this command...` |
| 7 | Admin runs `/watchtower-reset-password user:@user-without-pim-account` | Ephemeral: `<@user> does not have a PIM account.` |
| 8 | Admin resets a locked user (`lockedAt` set) | Succeeds; user can run `/set-password` immediately without needing `/watchtower-unlock` first |
| 9 | Admin resets a blocked user (`blockedAt` set) | Succeeds; user can run `/set-password` and `/elevate` without needing `/watchtower-unlock` |

### Pre-existing flows — regression verification

| Step | Action | Expected result |
|---|---|---|
| 10 | `/elevate` on a user with a valid password | Works normally — null guard does not fire |
| 11 | `/elevate` on a locked user (no reset) | `Your PIM account is locked due to too many failed attempts...` |
| 11 | `/watchtower-unlock @user` | Works normally — unchanged |
| 12 | `/help` | Admin Commands section includes `/watchtower-reset-password` line |

---

## Rollback plan

If the deployment must be reverted:

1. **Code rollback:** Revert the six changed source files and remove `reset-password.ts`. Redeploy via Portainer. The new command disappears; `/elevate` reverts to calling `verifyPassword` without the null guard.

2. **Schema concern — `passwordHash` nullability:** After code rollback, the column remains nullable at the DB level. The old code declared `passwordHash` as `String` (non-null), but Prisma will still read and write the column correctly — it simply won't present the field as `string | null`. No application error results unless a row actually has `passwordHash = NULL`.

   - If no resets were performed before the rollback: the old code works identically to before deployment. No action required.
   - If any resets were performed before the rollback: rows with `passwordHash = NULL` exist. The old code will read these as an empty string `""` (Prisma coercion from null for a `String` field). `verifyPassword("", userPassword)` will return `false`, triggering the failed-attempt counter — the affected users will see incorrect password errors rather than a clear "please set your password" message. To fix: run `/watchtower-unlock` for affected users and ask them to set a password via `/set-password` using the correct URL of the reverted bot.

3. **DB column rollback (optional, if desired):** Only safe if no rows have `passwordHash = NULL`. Run:
   ```sql
   UPDATE "pim_users" SET "passwordHash" = '$2b$12$PLACEHOLDER' WHERE "passwordHash" IS NULL;
   ALTER TABLE "pim_users" ALTER COLUMN "passwordHash" SET NOT NULL;
   ```
   Replace the placeholder with a known-invalid bcrypt string so affected users are effectively locked out until they reset via the full re-deployment.

4. **Enum rollback:** PostgreSQL does not support removing enum values. `PASSWORD_RESET` will remain in the `AuditEventType` enum permanently but will be unreachable from old application code. This is harmless.

---

## Monitoring and alerting

No new infrastructure required. The following indicates healthy operation of the new feature:

| Log / Signal | Meaning |
|---|---|
| `PASSWORD_RESET` row in `audit_logs` table | Successful reset; expected after each admin invocation |
| `🔏 \`PASSWORD_RESET\` — <@user> — ...` in audit channel | Audit channel echo working correctly |
| No errors mentioning `passwordHash` in bot logs | Migration applied correctly; Prisma client sees nullable field |

The existing audit channel and Portainer container health monitoring cover this feature without any changes to alerting configuration.

---

## Version tagging (after deploy confirmed healthy)

```bash
git tag v0.2.0
git push origin v0.2.0
```
