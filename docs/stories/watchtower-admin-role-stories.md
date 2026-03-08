# User Stories: Watchtower Admin Role

**Epic:** Watchtower Admin Role — Decoupled Bot Management Permissions
**Date:** 2026-03-08

---

## Process Flow

### Current State
```
User invokes admin command
  └── Discord checks setDefaultMemberPermissions (Manage Roles / Administrator)
        └── If passes → execute() runs with no further check
              └── Any user with Manage Roles (including temporarily elevated users) can manage the bot
```

### Future State
```
User invokes admin command
  └── Discord checks setDefaultMemberPermissions (unchanged — UI gating only)
        └── execute() runs → calls isWatchtowerAdmin(member, guildConfig)
              ├── adminRoleId not configured (null) → returns member.permissions.has(Administrator)
              │     ├── YES (has Administrator) → command proceeds
              │     └── NO  → ephemeral "permission denied" reply, command aborts
              └── adminRoleId configured → returns member.roles.cache.has(adminRoleId)
                    ├── YES (has the Watchtower Admin role) → command proceeds
                    └── NO  → ephemeral "permission denied" reply, command aborts
                          NOTE: Administrator alone is NOT sufficient once adminRoleId is set
              └── Audit log entry always includes isWatchtowerAdmin flag in metadata
```

---

## Stories

---

### Story 1: Schema — Add adminRoleId to GuildConfig

**As a** database administrator,
**I want** the `GuildConfig` table to store an optional `adminRoleId`,
**So that** each guild can independently designate a Watchtower Admin role.

**Acceptance Criteria:**
- [ ] `adminRoleId String?` column added to `GuildConfig` model in `prisma/schema.prisma`
- [ ] A Prisma migration file is generated (`npm run db:migrate:dev`)
- [ ] Existing rows are unaffected (column defaults to NULL)
- [ ] `getOrCreateGuildConfig()` continues to work without modification (upsert create does not require adminRoleId)
- [ ] New `ADMIN_ROLE_CONFIGURED` event type added to `AuditEventType` enum

**Edge Cases:**
- Migration must be non-destructive (nullable column, no backfill needed)

---

### Story 2: Shared Helper — isWatchtowerAdmin()

**As a** developer,
**I want** a single `isWatchtowerAdmin(member, config)` function,
**So that** all admin commands enforce the same access rule with no duplication.

**Acceptance Criteria:**
- [ ] File created at `src/lib/permissions.ts`
- [ ] Function signature: `isWatchtowerAdmin(member: GuildMember, config: GuildConfig): boolean`
- [ ] When `config.adminRoleId` is null or empty string → returns `member.permissions.has(PermissionFlagsBits.Administrator)` (bootstrap mode)
- [ ] When `config.adminRoleId` is set (non-empty) → returns `member.roles.cache.has(config.adminRoleId)` ONLY — Administrator alone is NOT sufficient
- [ ] Function is pure (no async, no DB calls) — caller is responsible for fetching member and config
- [ ] Exported from `src/lib/permissions.ts`
- [ ] Unit-testable with a mock GuildMember

**Edge Cases:**
- `adminRoleId` is an empty string → treat as null (role not configured; bootstrap mode)
- Member has Administrator but not the admin role when adminRoleId is set → returns false (denied)
- Member is not in guild (fetch failed) → caller handles, does not reach this function

---

### Story 3: Runtime Guard — All Admin Commands

**As a** server owner,
**I want** all Watchtower admin commands to enforce the Watchtower Admin role at runtime,
**So that** a temporarily elevated user who gains Manage Roles cannot manage the bot.

**Affected Commands:** `assign`, `revoke`, `list`, `unlock`, `config`

**Acceptance Criteria (per command):**
- [ ] After `deferReply`, fetch the invoking member from the guild
- [ ] Call `isWatchtowerAdmin(member, config)`
- [ ] If false → `editReply` with ephemeral message: "You do not have permission to use this command. A Watchtower Admin role is required." and return
- [ ] If true → command proceeds normally
- [ ] `setDefaultMemberPermissions` remains on each command (for Discord UI visibility) but is NOT relied upon for security
- [ ] All five commands have identical guard logic (no divergence)

**Edge Cases:**
- `interaction.member` is null (DM context) → treat as not admin (guild commands only)
- Member fetch fails → catch error, reply with generic "Unable to verify permissions" and return

---

### Story 4: Configure Admin Role — /watchtower-config Extension

**As a** server owner with Discord Administrator permission,
**I want** to set the Watchtower Admin role via `/watchtower-config admin-role:@role`,
**So that** I can designate which Discord role gates bot management.

**Acceptance Criteria:**
- [ ] `/watchtower-config` gains a new optional `admin-role` role option
- [ ] When provided, `adminRoleId` is saved to `GuildConfig`
- [ ] The response embed includes a new "Admin Role" field showing the current value (`<@&roleId>` or "Not set — using Discord Administrator")
- [ ] An `ADMIN_ROLE_CONFIGURED` audit log entry is written when the admin role is changed, with metadata `{ configuredBy, roleId, roleName }`
- [ ] Setting admin-role to a role that is itself manageable via PIM shows a warning (but does not block)
- [ ] The command is protected by its own runtime guard (Story 3 — bootstrap: Administrator fallback applies here)

**Edge Cases:**
- No options provided → display current config (existing behaviour preserved)
- Admin role set to `@everyone` → accepted (valid role ID), no special handling needed

---

### Story 5: Elevation Filter — Exclude Admin Role from Dropdown

**As a** user running `/elevate`,
**I want** the Watchtower Admin role to never appear in my role selection dropdown,
**So that** users cannot elevate themselves to bot management permissions.

**Acceptance Criteria:**
- [ ] In `elevate.ts`, after building the eligible roles list, filter out any role whose `roleId === config.adminRoleId`
- [ ] If filtering leaves zero eligible roles, reply: "You have no eligible roles available. Contact an administrator."
- [ ] If `adminRoleId` is null, no filtering occurs (all eligible roles shown as before)

**Edge Cases:**
- User's only eligible role is the admin role → they see "no roles available" message
- Admin role ID changes between eligibility assignment and elevation → filter uses current config at elevation time

---

### Story 6: Audit Log Enrichment — isWatchtowerAdmin Flag

**As a** security auditor,
**I want** every admin-command audit log entry to record whether the actor held the Watchtower Admin role,
**So that** I can distinguish legitimate admin actions from actions taken during a temporary elevation.

**Acceptance Criteria:**
- [ ] All `writeAuditLog` calls originating from admin commands include `isWatchtowerAdmin: boolean` in the `metadata` field
- [ ] The flag is set based on the result of `isWatchtowerAdmin()` at the time of command execution
- [ ] Existing metadata fields (e.g. `grantedBy`, `revokedBy`) are preserved alongside the new flag
- [ ] The `ADMIN_ROLE_CONFIGURED` event type is added to the `AuditEventType` enum

**Edge Cases:**
- Audit log call must not fail if metadata merging fails → wrap in try/catch or use safe merge

---

## Data Requirements

| Field | Type | Location | Notes |
|---|---|---|---|
| `adminRoleId` | `String?` | `GuildConfig` | Discord role snowflake ID; null = not configured |
| `ADMIN_ROLE_CONFIGURED` | enum value | `AuditEventType` | New event type |
| `isWatchtowerAdmin` | `boolean` | `AuditLog.metadata` | JSON field, always present in admin-command logs |

---

## Acceptance Test Matrix

| Scenario | Expected Result |
|---|---|
| adminRoleId = null, user has Administrator | All admin commands succeed (bootstrap mode) |
| adminRoleId = null, user has Manage Roles only | Discord UI hides commands; runtime guard checks Administrator → denied |
| adminRoleId = null, user has Manage Roles + Administrator | Commands succeed (bootstrap Administrator fallback) |
| adminRoleId = set, user has the Watchtower Admin role | All admin commands succeed |
| adminRoleId = set, user has Manage Roles only | Runtime guard denies; ephemeral error returned |
| adminRoleId = set, user has Administrator but NOT the admin role | Runtime guard DENIES — Administrator is not sufficient once adminRoleId is configured |
| adminRoleId = set, user has both Administrator AND the admin role | Commands succeed (has the admin role) |
| adminRoleId = set to admin role, user tries to /elevate to it | Role filtered from dropdown; not selectable |
| adminRoleId = set, user's only eligible role is the admin role | "No eligible roles available" message shown |
