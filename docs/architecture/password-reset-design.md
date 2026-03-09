# Technical Design: Self-Service Password Reset via Admin

**Feature:** PIM-003 — `/watchtower-reset-password`
**Author:** Solution Architect
**Date:** 2026-03-09

---

## 1. Overview

This document specifies every technical change required to implement the admin password-reset command. The feature touches four areas: the Prisma schema, a new database migration, a new admin command file, and two existing source files (`elevate.ts` and `help.ts`). No new infrastructure, external services, or API contracts are required.

---

## 2. Database Schema Change

### 2.1 Change: `PimUser.passwordHash` — `String` → `String?`

**File:** `prisma/schema.prisma`

**Before:**
```prisma
model PimUser {
  ...
  passwordHash   String
  ...
}
```

**After:**
```prisma
model PimUser {
  ...
  passwordHash   String?
  ...
}
```

Making the field nullable is the correct sentinel strategy. The alternative — a magic string constant like `"__RESET__"` — would be fragile (it could theoretically be a real bcrypt hash, bcrypt output always starts with `$2b$`, so it wouldn't, but NULL is semantically clearer and eliminates any ambiguity entirely). NULL unambiguously means "no credential set; user must call /set-password".

**Impact on existing code:**

| Location | Impact |
|---|---|
| `set-password.ts` | Zero — the `update` branch writes a new non-null hash; the `create` branch also writes a non-null hash. Both paths are unaffected. |
| `elevate.ts` | Requires a new guard (see Section 4.2). The existing `verifyPassword(password, pimUser.passwordHash)` call must NOT be reached when `passwordHash` is null — TypeScript will surface this as a type error after the schema change, enforcing the guard. |
| `buttonHandlers.ts` | Zero — button handlers do not read `passwordHash`. |
| `expireElevations.ts` | Zero — the cron job does not read `passwordHash`. |
| `unlock.ts`, `assign.ts`, `revoke.ts`, `list.ts`, `config.ts` | Zero — none of these read `passwordHash`. |

### 2.2 Change: New `AuditEventType` enum value

**File:** `prisma/schema.prisma`

```prisma
enum AuditEventType {
  // ... existing values ...
  PASSWORD_RESET   // <-- new
}
```

Position: appended after `ELEVATION_BLOCKED` (the last existing value).

---

## 3. Database Migration

### 3.1 Migration file

**Path:** `prisma/migrations/20260309000000_nullable_password_hash/migration.sql`

**Timestamp:** `20260309000000` — one day after the most recent migration (`20260308000002`).

**Content:**

```sql
-- Migration: nullable_password_hash
-- Makes passwordHash nullable on pim_users to support admin-initiated password reset.
-- Adds PASSWORD_RESET to the AuditEventType enum.
-- All column names are camelCase per project convention.

-- Allow NULL in passwordHash (existing rows are unaffected — their values remain non-null)
ALTER TABLE "pim_users" ALTER COLUMN "passwordHash" DROP NOT NULL;

-- Add new audit event type
ALTER TYPE "AuditEventType" ADD VALUE 'PASSWORD_RESET';
```

### 3.2 Migration characteristics

- **Non-destructive:** `DROP NOT NULL` on a column with no default is safe for all existing rows. All currently stored hashes remain intact.
- **No data transformation required:** existing non-null values are untouched; the constraint is merely relaxed.
- **Reversibility:** `ALTER COLUMN "passwordHash" SET NOT NULL` would reverse it (provided no rows have a null value at that time).
- **Enum addition:** PostgreSQL `ALTER TYPE ... ADD VALUE` is safe and non-destructive. Enum values cannot be removed without a full table rewrite, which is acceptable — `PASSWORD_RESET` is a permanent audit concept.

### 3.3 `migration_lock.toml`

No change required. The lock file is managed by Prisma CLI.

---

## 4. Application Code Changes

### 4.1 New file: `src/commands/admin/reset-password.ts`

This file is the sole implementation artifact for STORY-01.

**Command registration:**
- Name: `watchtower-reset-password`
- Description: `"Clear a user's PIM password, forcing them to run /set-password again."`
- Option: `user` (type: User, required, description: `"The user whose password to reset"`)
- No `setDefaultMemberPermissions` (per CLAUDE.md admin command convention)

**Execution sequence:**

```
1. deferReply({ flags: MessageFlags.Ephemeral })
2. const guildId = interaction.guildId!
3. const config = await getOrCreateGuildConfig(guildId)
4. const member = interaction.member as GuildMember
5. if (!isWatchtowerAdmin(member, config)) → editReply(permission error) + return
6. const target = interaction.options.getUser("user", true)
7. const pimUser = await db.pimUser.findUnique({ where: { discordUserId_guildId: { discordUserId: target.id, guildId } } })
8. if (!pimUser) → editReply("does not have a PIM account") + return
9. await db.pimUser.update({
     where: { id: pimUser.id },
     data: { passwordHash: null, lockedAt: null, blockedAt: null, failedAttempts: 0 }
   })
10. await writeAuditLog(client, {
      guildId,
      discordUserId: target.id,
      pimUserId: pimUser.id,
      eventType: "PASSWORD_RESET",
      metadata: { resetBy: interaction.user.id, isWatchtowerAdmin: true }
    })
11. return interaction.editReply(
      `<@${target.id}>'s PIM password has been reset. They must run /set-password before they can elevate again.`
    )
```

**Imports required:**
```typescript
import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  Client,
  GuildMember,
  MessageFlags,
} from "discord.js";
import { db } from "../../lib/database";
import { writeAuditLog } from "../../lib/audit";
import { getOrCreateGuildConfig } from "../../lib/guildConfig";
import { isWatchtowerAdmin } from "../../lib/permissions";
```

**No `skipChannelPost`** — `writeAuditLog` posts the standard plain-text echo to the audit channel. There are no interactive buttons for this event.

### 4.2 Modified file: `src/commands/user/elevate.ts`

**Change:** Add a null-password guard after the `blockedAt` check, before the `verifyPassword` call.

**Insertion point:** Between the `blockedAt` block (lines 52–56) and the `verifyPassword` call (line 59).

**New guard:**
```typescript
// Null-password check — set when admin runs /watchtower-reset-password
if (pimUser.passwordHash === null) {
  return interaction.editReply(
    "Your PIM password has been reset by an administrator. Please run /set-password to set a new password before you can elevate."
  );
}
```

**TypeScript note:** After the schema change, `pimUser.passwordHash` has type `string | null`. The existing call `verifyPassword(password, pimUser.passwordHash)` will produce a TypeScript compile error because `verifyPassword` accepts `string` (not `string | null`). The null guard above — being a `return` statement — narrows the type so that after the guard, TypeScript knows `passwordHash` is `string`. This eliminates the compile error without requiring a non-null assertion operator.

**No change to `verifyPassword` signature in `crypto.ts`** — the function already accepts `string` and this remains correct; the narrowing in `elevate.ts` handles the type.

### 4.3 Modified file: `src/commands/user/help.ts`

**Change:** Add one line to the Admin Commands field value.

**Insertion point:** After the `/watchtower-unlock` line, before the `/watchtower-config` line.

**New line:**
```
"`/watchtower-reset-password` — Clear a user's PIM password, forcing them to run `/set-password` again.\n"
```

### 4.4 Modified file: `src/lib/audit.ts`

**Change:** Add emoji mapping for `PASSWORD_RESET`.

**Insertion point:** In the `eventTypeEmoji` function's map object, after the `PASSWORD_CHANGED` entry.

**New entry:**
```typescript
PASSWORD_RESET: "🔑",
```

The `🔑` (key) emoji signals a credential event, consistent with `ELEVATION_REQUESTED` which also uses `🔑`. This is appropriate — both are authentication credential events.

---

## 5. File Change Summary

| File | Change Type | Story |
|---|---|---|
| `prisma/schema.prisma` | Modified — `passwordHash` nullable + `PASSWORD_RESET` enum | STORY-02 |
| `prisma/migrations/20260309000000_nullable_password_hash/migration.sql` | New file | STORY-02 |
| `src/commands/admin/reset-password.ts` | New file | STORY-01 |
| `src/commands/user/elevate.ts` | Modified — null-password guard | STORY-03 |
| `src/commands/user/help.ts` | Modified — new command in admin section | STORY-05 |
| `src/lib/audit.ts` | Modified — emoji for `PASSWORD_RESET` | STORY-01 |

**Total:** 2 new files, 4 modified files.

---

## 6. API Contracts

There are no new HTTP APIs, REST endpoints, or external service integrations. The only "API" is the Discord slash command, fully defined in Section 4.1.

**Command contract:**

| Property | Value |
|---|---|
| Name | `watchtower-reset-password` |
| Type | Chat Input (Slash Command) |
| Scope | Guild only (uses `interaction.guildId!`) |
| Option name | `user` |
| Option type | `USER` |
| Option required | `true` |
| Response | Ephemeral (always) |
| Visible to non-admins | Yes (no `setDefaultMemberPermissions`) — blocked at runtime by `isWatchtowerAdmin` |

---

## 7. Security Requirements

### 7.1 Authorization

- `isWatchtowerAdmin(member, config)` is the sole authorization gate, called immediately after `deferReply`.
- The guild config is fetched from DB with `getOrCreateGuildConfig(guildId)` — never hardcoded.
- Guild isolation is enforced: `findUnique` scopes the `PimUser` lookup by `{ discordUserId, guildId }`.

### 7.2 No privilege escalation path

- The command only clears the password hash. It does not grant any roles, elevate any sessions, or modify `EligibleRole` records.
- A reset cannot be used to bypass any other security check — the user must still call `/set-password` (complexity-validated) and `/elevate` (which still does all existing checks) before gaining any elevated role.

### 7.3 Audit trail completeness

- `PASSWORD_RESET` is written to the DB audit log on every successful reset, with `resetBy` (admin Discord user ID) in metadata.
- The event is echoed to the audit channel, giving server operators real-time visibility.
- The audit log is immutable (append-only via Prisma — no delete operations on `AuditLog`).

### 7.4 No sensitive data in replies

- Admin reply confirms the user and the action only. It does not reveal any credential information (there is no new credential to reveal — `passwordHash` is set to null).
- User error message (Screen D1) does not reveal who performed the reset.

### 7.5 Idempotency

- Running the command on a user who already has `passwordHash = null` is safe: Prisma `update` with `{ passwordHash: null }` on a field already null is a no-op at the DB level. An audit log entry is still written, providing full history of all reset events.

---

## 8. Infrastructure Requirements

No new infrastructure is required. The feature runs entirely within the existing bot process and PostgreSQL instance. No new environment variables, no new Docker services, no changes to `docker-compose.yml`.

---

## 9. Rollback Plan

If a rollback is needed after deployment:

1. **Code rollback:** Revert the three modified files and remove the new command file. The bot will no longer register `watchtower-reset-password`.
2. **Schema rollback:** Execute `ALTER TABLE "pim_users" ALTER COLUMN "passwordHash" SET NOT NULL;` — this succeeds only if no rows currently have `passwordHash = null`. If any do, those rows must be updated first (e.g. to a known dummy hash, then have the user re-run `/set-password`).
3. **Enum rollback:** PostgreSQL does not support removing enum values. `PASSWORD_RESET` will remain in the enum but will be unreachable from the application code. This is harmless.

The rollback window is narrow — once any row has a null `passwordHash`, the `SET NOT NULL` migration cannot be run without data cleanup. This is a standard risk for any schema change that writes nulls.
