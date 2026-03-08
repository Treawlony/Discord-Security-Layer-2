# Technical Design: Role Expiry Notifications

**Feature:** role-expiry-notifications
**Date:** 2026-03-08
**Stories Covered:** STORY-001 through STORY-008

---

## 1. Overview

This document defines the technical architecture for the Role Expiry Notifications feature. The design is entirely additive: no existing interfaces are broken, no existing data is modified, and all new code paths are isolated behind feature-specific gates (`notifyBeforeMin > 0`, `auditChannelId != null`).

---

## 2. Database Schema Changes

### 2.1 Prisma Model Changes

#### GuildConfig — add `notifyBeforeMin`

```prisma
model GuildConfig {
  // ... existing fields ...
  notifyBeforeMin    Int      @default(5)   // NEW: minutes before expiry to warn; 0 = disabled
}
```

#### ActiveElevation — add `notifiedAt`

```prisma
model ActiveElevation {
  // ... existing fields ...
  notifiedAt         DateTime?              // NEW: set when warning posted; null = not yet warned
}
```

#### PimUser — add `blockedAt`

```prisma
model PimUser {
  // ... existing fields ...
  blockedAt          DateTime?              // NEW: set by admin block action; null = not blocked
}
```

#### AuditEventType — add five new values

```prisma
enum AuditEventType {
  // ... existing values ...
  ELEVATION_EXPIRY_WARNING
  ELEVATION_EXTENDED
  ELEVATION_ADMIN_REVOKED
  ELEVATION_ADMIN_REVOKED_BLOCKED
  ELEVATION_BLOCKED
}
```

### 2.2 Migration SQL

Migration name: `add_expiry_notifications`

```sql
-- Add notifyBeforeMin to guild_configs (default 5, NOT NULL)
ALTER TABLE "guild_configs"
  ADD COLUMN "notifyBeforeMin" INTEGER NOT NULL DEFAULT 5;

-- Add notifiedAt to active_elevations (nullable)
ALTER TABLE "active_elevations"
  ADD COLUMN "notifiedAt" TIMESTAMP(3);

-- Add blockedAt to pim_users (nullable)
ALTER TABLE "pim_users"
  ADD COLUMN "blockedAt" TIMESTAMP(3);
```

Prisma enum migration (handled by Prisma in the same migration file):
```sql
ALTER TYPE "AuditEventType"
  ADD VALUE 'ELEVATION_EXPIRY_WARNING',
  ADD VALUE 'ELEVATION_EXTENDED',
  ADD VALUE 'ELEVATION_ADMIN_REVOKED',
  ADD VALUE 'ELEVATION_ADMIN_REVOKED_BLOCKED',
  ADD VALUE 'ELEVATION_BLOCKED';
```

All column names are camelCase per project convention. No destructive changes. Existing rows get `notifyBeforeMin = 5` (opted in), `notifiedAt = NULL`, `blockedAt = NULL` automatically.

---

## 3. New File: `src/lib/buttonHandlers.ts`

All three button interaction handlers are co-located in a single file to keep `interactionCreate.ts` clean. Each handler is an exported async function receiving `(interaction: ButtonInteraction, client: Client)`.

### 3.1 `handleExtendSession(interaction, client)`

```
Input:  ButtonInteraction, customId = "extend_session:<elevationId>"
Auth:   interaction.user.id must equal elevation.pimUser.discordUserId
Steps:
  1. Parse elevationId from customId.
  2. Fetch ActiveElevation (include pimUser) from DB.
  3. If not found → reply ephemeral "This elevation has already expired or been revoked." → return.
  4. If interaction.user.id !== elevation.pimUser.discordUserId → reply ephemeral error → return.
  5. Fetch guild config (getOrCreateGuildConfig).
  6. Compute newExpiresAt = now + config.sessionDurationMin * 60 * 1000.
  7. Update ActiveElevation: { expiresAt: newExpiresAt, notifiedAt: null }.
  8. Write ELEVATION_EXTENDED audit log.
  9. Update original message: remove components (disable button).
  10. Reply ephemeral: "Your ROLE_NAME elevation has been extended until <t:UNIX:R>."
```

### 3.2 `handleRemovePerm(interaction, client)`

```
Input:  ButtonInteraction, customId = "remove_perm:<elevationId>"
Auth:   isWatchtowerAdmin(member, config)
Steps:
  1. Parse elevationId from customId.
  2. deferReply ephemeral (button interactions must be acknowledged quickly).
  3. Fetch ActiveElevation (include pimUser) from DB.
  4. If not found → editReply "This elevation has already ended." → return.
  5. Fetch guild config.
  6. Check isWatchtowerAdmin(interaction.member as GuildMember, config).
     If false → editReply access-denied error → return.
  7. Remove Discord role from member (non-fatal catch if member left).
  8. Delete ActiveElevation record.
  9. Write ELEVATION_ADMIN_REVOKED audit log with metadata { revokedBy, isWatchtowerAdmin: true }.
  10. Update original message: remove components.
  11. editReply: "ROLE_NAME has been removed from <@USER_ID>."
```

### 3.3 `handleRemovePermBlock(interaction, client)`

```
Input:  ButtonInteraction, customId = "remove_perm_block:<elevationId>"
Auth:   isWatchtowerAdmin(member, config)
Steps:
  1–6: Same as handleRemovePerm (parse, defer, fetch, not-found guard, config, admin check).
  7. Remove Discord role (non-fatal catch).
  8. Delete ActiveElevation record.
  9. Update PimUser: { blockedAt: now }.
  10. Write ELEVATION_ADMIN_REVOKED_BLOCKED audit log with metadata { revokedBy, isWatchtowerAdmin: true }.
  11. Write ELEVATION_BLOCKED audit log.
  12. Update original message: remove components.
  13. editReply: "ROLE_NAME has been removed from <@USER_ID> and their PIM account has been blocked."
```

---

## 4. Modified File: `src/events/interactionCreate.ts`

Add a button interaction branch before the existing `isChatInputCommand` branch:

```typescript
if (interaction.isButton()) {
  const { customId } = interaction;
  if (customId.startsWith("extend_session:")) {
    return handleExtendSession(interaction as ButtonInteraction, client);
  }
  if (customId.startsWith("remove_perm_block:")) {
    return handleRemovePermBlock(interaction as ButtonInteraction, client);
  }
  if (customId.startsWith("remove_perm:")) {
    return handleRemovePerm(interaction as ButtonInteraction, client);
  }
  // Unknown button — ignore silently
  return;
}
```

Note: `remove_perm_block:` must be checked before `remove_perm:` because `startsWith("remove_perm:")` would also match `remove_perm_block:`.

---

## 5. Modified File: `src/jobs/expireElevations.ts`

The cron callback gains a warning scan block that runs before the existing expiry scan.

### Warning Scan Logic

```typescript
async function runWarningScan(client: Client): Promise<void> {
  // Fetch all guilds that have notifyBeforeMin > 0 and auditChannelId set.
  // Then for each guild, find elevations in the warning window.
  // This is done efficiently by fetching qualifying elevations with their
  // guild config in a single query using Prisma's relational filter.

  // Query pattern:
  const configs = await db.guildConfig.findMany({
    where: {
      notifyBeforeMin: { gt: 0 },
      auditChannelId: { not: null },
    },
  });

  for (const config of configs) {
    const windowEnd = new Date(Date.now() + config.notifyBeforeMin * 60 * 1000);
    const toWarn = await db.activeElevation.findMany({
      where: {
        guildId: config.guildId,
        expiresAt: { lte: windowEnd, gt: new Date() },
        notifiedAt: null,
      },
      include: { pimUser: true },
    });

    for (const elevation of toWarn) {
      // Post warning message with Extend Session button to auditChannelId
      // Set notifiedAt regardless of whether the post succeeded
      // Write ELEVATION_EXPIRY_WARNING audit log
    }
  }
}
```

**Performance note:** The warning scan adds one `findMany` on `guild_configs` (expected row count: small) and one `findMany` per guild with `notifyBeforeMin > 0`. Both queries are indexed (`guildId` on `active_elevations` is unique-compound with `pimUserId`). The scan completes well within the 60-second cron window.

---

## 6. Modified File: `src/commands/user/elevate.ts`

After the existing `lockedAt` check (line ~42), add:

```typescript
if (pimUser.blockedAt) {
  return interaction.editReply(
    "Your PIM account has been blocked by an administrator. Contact a Watchtower Admin to restore access."
  );
}
```

The elevation-granted section (after role is assigned) is modified to post to `auditChannelId` with buttons instead of (or in addition to) `alertChannelId` with plain text:

```
Priority 1: Post to auditChannelId with buttons (STORY-003).
Fallback:   If auditChannelId is null but alertChannelId is set, post plain text to alertChannelId (existing behaviour preserved).
```

The `ActiveElevation` record returned from the `upsert` provides the `elevationId` needed for `customId` construction.

---

## 7. Modified File: `src/commands/admin/unlock.ts`

The `db.pimUser.update` call is extended to also clear `blockedAt`:

```typescript
await db.pimUser.update({
  where: { id: pimUser.id },
  data: { lockedAt: null, failedAttempts: 0, blockedAt: null },
});
```

The guard condition is relaxed from `if (!pimUser.lockedAt)` to `if (!pimUser.lockedAt && !pimUser.blockedAt)` so that an account blocked but not locked can also be unlocked. The audit log metadata gains `clearedBlock: pimUser.blockedAt !== null`.

---

## 8. Modified File: `src/commands/admin/config.ts`

### New option on SlashCommandBuilder

```typescript
.addIntegerOption((opt) =>
  opt
    .setName("notify-before")
    .setDescription("Minutes before expiry to warn the user (0 to disable)")
    .setMinValue(0)
    .setMaxValue(60)
)
```

### Config update logic

```typescript
const notifyBefore = interaction.options.getInteger("notify-before");
// ...
data: {
  // ... existing fields ...
  notifyBeforeMin: notifyBefore ?? current.notifyBeforeMin,
}
```

### Embed update

Add field after "Session Duration":
```typescript
{ name: "Expiry Warning", value: `${updated.notifyBeforeMin} min before expiry${updated.notifyBeforeMin === 0 ? " (disabled)" : ""}`, inline: true }
```

### Caution note

```typescript
const warnNote = (notifyBefore !== null && notifyBefore > updated.sessionDurationMin)
  ? `Note: notify-before (${notifyBefore} min) exceeds session-duration (${updated.sessionDurationMin} min). The warning will fire immediately after every new elevation.`
  : undefined;
```

---

## 9. Modified File: `src/lib/guildConfig.ts`

No changes needed to `getOrCreateGuildConfig()` — Prisma will use the schema default (`5`) when creating new guild configs. The existing upsert pattern handles this correctly because `notifyBeforeMin` has `@default(5)` in the schema.

---

## 10. Modified File: `src/lib/audit.ts`

The `eventTypeEmoji` map gains entries for the five new event types:

```typescript
ELEVATION_EXPIRY_WARNING: "⏰",
ELEVATION_EXTENDED:       "🔁",
ELEVATION_ADMIN_REVOKED:  "🚫",
ELEVATION_ADMIN_REVOKED_BLOCKED: "🔴",
ELEVATION_BLOCKED:        "⛔",
```

---

## 11. Security Considerations

### Button Authentication

| Button | Auth Mechanism | Failure Response |
|---|---|---|
| Extend Session | `interaction.user.id === elevation.pimUser.discordUserId` | Ephemeral error, no state change |
| Remove Permission | `isWatchtowerAdmin(member, config)` | Ephemeral error, no state change |
| Remove Permission and Block | `isWatchtowerAdmin(member, config)` | Ephemeral error, no state change |

### customId Tamper Resistance

Discord `customId` values are visible to clients and could be fabricated. The elevation ID (`cuid()`) is not guessable (cryptographically random CUID), but the handler must always re-fetch the elevation from the database and re-validate auth — never trust the customId alone.

### `blockedAt` vs `lockedAt`

Both fields represent account restrictions but with different semantics:
- `lockedAt`: set automatically after N failed password attempts; cleared by `/watchtower-unlock`.
- `blockedAt`: set by explicit admin action (button); cleared by `/watchtower-unlock`.
Both are checked in `/elevate` before proceeding. Both are cleared by `/watchtower-unlock`.

### Non-fatal Error Handling

All Discord API calls in the warning scan (channel post) and button handlers (role remove, channel update) are wrapped in try/catch. A failure in a non-critical path (e.g. updating the original message components) must never prevent the core security action (role removal, DB update, audit log write) from completing.

---

## 12. File Change Summary

| File | Change Type | Notes |
|---|---|---|
| `prisma/schema.prisma` | Modified | 3 new fields, 5 new enum values |
| `prisma/migrations/<ts>_add_expiry_notifications/migration.sql` | New | Additive SQL only |
| `src/lib/buttonHandlers.ts` | New | All three button handlers |
| `src/events/interactionCreate.ts` | Modified | Button routing branch added |
| `src/jobs/expireElevations.ts` | Modified | Warning scan added |
| `src/commands/user/elevate.ts` | Modified | blockedAt check + audit-channel post with buttons |
| `src/commands/admin/unlock.ts` | Modified | blockedAt cleared |
| `src/commands/admin/config.ts` | Modified | notify-before option + embed field |
| `src/commands/user/help.ts` | Modified | Updated config command description |
| `src/lib/audit.ts` | Modified | 5 new emoji mappings |

Total: 2 new files, 8 modified files.

---

## 13. Infrastructure / Deployment

- No new environment variables required.
- No Docker Compose changes required.
- Portainer GitOps will pick up the new migration automatically via `prisma migrate deploy` in the container startup CMD.
- No bot permission changes required (bot already has Send Messages on channels it can access).
- The cron job is extended in-process; no new cron schedules or background workers.
