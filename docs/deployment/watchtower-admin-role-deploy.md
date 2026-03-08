# Deployment Checklist: Watchtower Admin Role

**Feature:** Watchtower Admin Role — Decoupled Bot Management Permissions
**Date:** 2026-03-08
**Deploy type:** Database migration + code change (migration-first)

---

## Pre-Deployment

- [ ] Code merged to `master`
- [ ] `npm run typecheck` passes (0 errors) — verified in CI
- [ ] `npm test` passes (75/75) — verified in CI
- [ ] Migration file present at `prisma/migrations/20260308000000_add_admin_role_id_to_guild_config/migration.sql`

---

## Deployment Steps

### Step 1 — Pull and Redeploy in Portainer

In the Portainer stack UI:
1. Click **Pull and redeploy**
2. Portainer pulls `master`, rebuilds the Docker image
3. The Dockerfile runs `prisma migrate deploy` before starting the bot — this applies the migration automatically
4. The bot starts with the new code

No manual migration step is needed. `prisma migrate deploy` is idempotent — it skips migrations already recorded in `_prisma_migrations`.

### Step 2 — Verify Migration Applied

Check bot startup logs for:
```
Applying migration `20260308000000_add_admin_role_id_to_guild_config`
```

Or verify directly in the database:
```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'guild_configs' AND column_name = 'admin_role_id';
```

Expected: 1 row returned.

### Step 3 — Verify New Audit Event Type

```sql
SELECT unnest(enum_range(NULL::"AuditEventType")) AS value;
```

Expected: includes `ADMIN_ROLE_CONFIGURED` in the list.

### Step 4 — Smoke Test (Manual)

1. **Bootstrap mode** (before setting admin role):
   - Log in as a user with Discord `Administrator`
   - Run `/watchtower-config` — should succeed and show "Admin Role: Not set — using Discord Administrator"

2. **Set admin role**:
   - Run `/watchtower-config admin-role:@YourRole` — should succeed, show updated embed, show warning message
   - Confirm `ADMIN_ROLE_CONFIGURED` appears in the audit channel (if configured)

3. **Configured mode — legitimate admin**:
   - With the Watchtower Admin role assigned, run `/watchtower-list` — should succeed

4. **Configured mode — denied**:
   - As a user with `Manage Roles` but NOT the Watchtower Admin role, run any admin command
   - Should receive: "You do not have permission to use this command."

5. **Elevate filter**:
   - Ensure the Watchtower Admin role is NOT available in the `/elevate` dropdown for any user
   - If a user only had the admin role assigned as eligible, they should see: "You have no eligible roles available."

6. **No regression**:
   - Run `/elevate` and `/set-password` as a normal user — both should work as before

---

## Rollback Plan

This migration is safe to roll back if needed:

```sql
-- Remove column (only if rolling back to pre-feature code)
ALTER TABLE "guild_configs" DROP COLUMN IF EXISTS "admin_role_id";

-- Enum values cannot be removed from PostgreSQL enums without recreating the type.
-- The ADMIN_ROLE_CONFIGURED enum value is safe to leave in place if rolling back code only.
-- It will be unused but causes no errors.
```

To roll back code only (without DB rollback):
1. Revert to the previous Git commit
2. Portainer Pull and redeploy
3. The old code does not reference `adminRoleId` or `ADMIN_ROLE_CONFIGURED` — they are simply unused columns/values. No errors.

---

## Environment Variables

No new environment variables required for this feature.

---

## Monitoring

No new metrics or alerts required. The existing audit channel integration covers:
- `ADMIN_ROLE_CONFIGURED` events will appear in the audit channel with the configured emoji prefix
- Failed permission checks do NOT emit an audit log (by design — denied attempts are not currently tracked)

**Optional future enhancement:** Add a `PERMISSION_DENIED` audit event type to track denied admin access attempts. Not in scope for this sprint.

---

## Operational Recovery Procedures

### Scenario: Admin role deleted from Discord

**Symptom:** All admin commands return "permission denied" to all users including the server owner.

**Cause:** The `adminRoleId` in `guild_configs` points to a deleted Discord role. `member.roles.cache.has(deletedId)` is always false.

**Recovery options (in order of preference):**

1. **Recreate the role in Discord** — Discord role IDs are snowflakes tied to the server; you cannot restore the same ID. Skip to option 2.

2. **Direct DB update** — Reset `adminRoleId` to null to re-enter bootstrap mode:
   ```sql
   UPDATE guild_configs SET admin_role_id = NULL WHERE guild_id = '<your-guild-id>';
   ```
   After this, any Discord `Administrator` can run `/watchtower-config admin-role:@NewRole` to set a new admin role.

3. **Set to a new role ID** — If you know the new role's Discord snowflake:
   ```sql
   UPDATE guild_configs SET admin_role_id = '<new-role-id>' WHERE guild_id = '<your-guild-id>';
   ```

**Prevention:** Do not delete the role designated as Watchtower Admin without first running `/watchtower-config admin-role:@NewRole` to migrate to a replacement role.

---

## Discord Command Propagation

The `/watchtower-config` command gained a new optional `admin-role` option. Discord global command updates propagate within up to 1 hour. During this window:
- Existing users may not see the new option in the autocomplete
- The command still works — the option is optional, so omitting it is valid
- No action needed; propagation is automatic
