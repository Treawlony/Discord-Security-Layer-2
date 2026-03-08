# Technical Design: Watchtower Admin Role

**Feature:** Watchtower Admin Role — Decoupled Bot Management Permissions
**Date:** 2026-03-08

---

## Architecture Overview

The change is entirely within the existing Node.js/TypeScript bot process. No new services, no new infrastructure. The work touches:

1. The Prisma schema (one new nullable column, one new enum value)
2. One new library module (`src/lib/permissions.ts`)
3. Five existing admin command files (guard injection)
4. One existing user command file (`elevate.ts` — filter injection)
5. One existing config command file (new option + embed field)

---

## Database Changes

### GuildConfig — new column

```prisma
model GuildConfig {
  id                 String   @id @default(cuid())
  guildId            String   @unique
  sessionDurationMin Int      @default(60)
  lockoutThreshold   Int      @default(5)
  alertChannelId     String?
  auditChannelId     String?
  adminRoleId        String?   // NEW: Discord role snowflake; null = not configured
  createdAt          DateTime @default(now())
  updatedAt          DateTime @updatedAt

  @@map("guild_configs")
}
```

Migration characteristics:
- `ALTER TABLE guild_configs ADD COLUMN admin_role_id TEXT;` — nullable, no default, no backfill
- Fully backward-compatible: existing rows get NULL, which is the "not configured" state
- No data loss risk

### AuditEventType — new enum value

```prisma
enum AuditEventType {
  // ... existing values ...
  ADMIN_ROLE_CONFIGURED   // NEW: emitted when adminRoleId is set or cleared
}
```

PostgreSQL enum addition is a non-destructive DDL operation (`ALTER TYPE ... ADD VALUE`). Prisma generates this correctly via migration.

---

## New Module: src/lib/permissions.ts

```typescript
// Responsibility: single, authoritative implementation of the Watchtower Admin check.
// No DB access. No async. Pure function — easy to unit test.

import { GuildMember, PermissionFlagsBits } from "discord.js";
import { GuildConfig } from "@prisma/client";

export function isWatchtowerAdmin(member: GuildMember, config: GuildConfig): boolean {
  // Bootstrap mode: no admin role configured — fall back to Discord Administrator
  if (!config.adminRoleId) {
    return member.permissions.has(PermissionFlagsBits.Administrator);
  }
  // Configured mode: Watchtower Admin role is the SOLE gate.
  // Administrator permission alone is NOT sufficient.
  return member.roles.cache.has(config.adminRoleId);
}
```

**Why pure / synchronous:**
- `interaction.member` in guild interactions is always a `GuildMember` with roles populated in cache (discord.js caches roles on member fetch; guild slash command interactions always carry the member object)
- `GuildConfig` is fetched by `getOrCreateGuildConfig()` which is already called in every admin command
- Keeping it synchronous avoids any possibility of a race between the permission check and the command logic

**Caller pattern (identical in all five admin commands):**

```typescript
// 1. Fetch guild config (already needed for other command logic)
const config = await getOrCreateGuildConfig(guildId);

// 2. Resolve member — interaction.member is GuildMember in guild context
const member = interaction.member as GuildMember;

// 3. Guard
if (!isWatchtowerAdmin(member, config)) {
  return interaction.editReply(
    "You do not have permission to use this command.\n\nA Watchtower Admin role is required. Contact your server owner to be assigned the correct role."
  );
}
```

---

## Modified Files

### src/commands/admin/assign.ts
- Add `isWatchtowerAdmin` guard after `deferReply`
- Add `isWatchtowerAdmin` flag to `ELIGIBILITY_GRANTED` audit log metadata
- Add warning if the assigned role is the Watchtower Admin role

### src/commands/admin/revoke.ts
- Add `isWatchtowerAdmin` guard after `deferReply`
- Add `isWatchtowerAdmin` flag to `ELIGIBILITY_REVOKED` and `ELEVATION_REVOKED` audit log metadata

### src/commands/admin/list.ts
- Add `isWatchtowerAdmin` guard after `deferReply`
- No audit log change (list is a read-only operation; no audit entry currently emitted — keep as-is)

### src/commands/admin/unlock.ts
- Add `isWatchtowerAdmin` guard after `deferReply`
- Add `isWatchtowerAdmin` flag to `ACCOUNT_UNLOCKED` audit log metadata

### src/commands/admin/config.ts
- Add `isWatchtowerAdmin` guard after `deferReply`
- Add new `admin-role` role option to SlashCommandBuilder
- Save `adminRoleId` to GuildConfig when option is provided
- Update response embed to include "Admin Role" field
- Emit `ADMIN_ROLE_CONFIGURED` audit log entry when admin role changes
- Add post-update warning message

### src/commands/user/elevate.ts
- After building eligible roles list, filter out any entry where `roleId === config.adminRoleId`
- Handle zero-roles-after-filter case

---

## API Contracts

No external API changes. The only Discord API surface changes are:

1. `/watchtower-config` gains a new optional `admin-role` role option — this is additive and backward-compatible (existing calls without the option continue to work)
2. `setDefaultMemberPermissions` on all five admin commands is lowered from `ManageRoles`/`Administrator` to `ManageRoles` uniformly — this makes the commands visible to a slightly wider Discord UI audience, but the runtime guard is the real gate. This is intentional: we want users who have the Watchtower Admin role (but perhaps not ManageRoles) to see and use these commands.

    **Decision:** Set `setDefaultMemberPermissions(0n)` (visible to all) on all admin commands, since the runtime guard is the sole gate. Discord's UI permission system is not reliable for our security model. This is the canonical approach when a bot has its own permission system.

    **Alternative considered:** Keep `ManageRoles` on the builder. Rejected because the Watchtower Admin role may not carry `ManageRoles`, which would hide commands from legitimate admins.

---

## Security Architecture

### Threat Model

| Threat | Mitigation |
|---|---|
| Temporarily elevated user (gains Manage Roles via PIM) attempts admin commands | `isWatchtowerAdmin()` checks role membership, not Discord permissions — elevation does not grant the Watchtower Admin role |
| User with Discord Administrator tries to manage bot after adminRoleId is set | `isWatchtowerAdmin()` returns false — Administrator alone is not sufficient in configured mode |
| Attacker calls slash command endpoint directly (bypasses Discord UI) | Runtime guard in `execute()` is always enforced — Discord UI gating is irrelevant |
| Server owner locks themselves out (sets admin role they don't hold) | Warning message shown; audit log records who configured the role |
| Admin role deleted from Discord after being set | `member.roles.cache.has(deletedRoleId)` returns false for all members — effective lockout. Mitigation: server owner can re-create the role with the same ID (Discord role IDs are stable) or use Discord Administrator to regain access (bootstrap). **Note: once adminRoleId is set, even the server owner cannot use Administrator to bypass** — this is by design per the epic requirements. The server owner must hold the configured role. |

### Data Flow

```
/watchtower-config admin-role:@WatchtowerAdmin
  → execute()
    → deferReply (ephemeral)
    → getOrCreateGuildConfig(guildId)         [DB read]
    → isWatchtowerAdmin(member, config)        [pure check]
      → if false: editReply(denied) + return
    → db.guildConfig.update({ adminRoleId })  [DB write]
    → writeAuditLog(ADMIN_ROLE_CONFIGURED)    [DB write + optional channel post]
    → editReply(embed + warning)
```

---

## Infrastructure & Deployment

- No environment variable changes required
- Prisma migration must run before the new bot code is deployed (migration-first deployment)
- The Prisma client must be regenerated after schema change (`npm run db:generate`)
- Portainer "Pull and redeploy" handles both: the Dockerfile runs `prisma migrate deploy` before starting the bot

---

## Dependencies Between Tasks

```
Story 1 (Schema) ──► Story 2 (permissions.ts) ──► Story 3 (guards on commands)
                                                 ──► Story 4 (config command extension)
                                                 ──► Story 5 (elevate filter)
                                                 ──► Story 6 (audit enrichment — inline with Story 3/4)
```

Stories 3, 4, 5, and 6 can all be implemented in parallel once Stories 1 and 2 are done.
