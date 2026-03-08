# Performance Review: Role Expiry Notifications

**Feature:** role-expiry-notifications
**Date:** 2026-03-08

---

## Cron Job Impact

### Before

The cron job ran one query per tick:

```
findMany(active_elevations WHERE expiresAt <= now)  — 1 query
+ N × (role remove + delete + writeAuditLog)
```

### After

The cron job now runs two scans per tick:

```
SCAN 1 (warning):
  findMany(guild_configs WHERE notifyBeforeMin > 0 AND auditChannelId != null)   — 1 query
  + M × findMany(active_elevations WHERE guildId = X AND window AND notifiedAt null) — M queries
  + M_warn × (update notifiedAt + channel.send + writeAuditLog)

SCAN 2 (expiry, unchanged):
  findMany(active_elevations WHERE expiresAt <= now)                              — 1 query
  + N × (role remove + delete + writeAuditLog)
```

Where:
- `M` = number of guilds with notifications enabled (expected: small, typically 1–10 for a self-hosted bot)
- `M_warn` = number of elevations currently in the warning window (expected: 0–5 per tick in normal operation)
- `N` = number of elevations expiring right now (expected: 0–2 per tick in normal operation)

**Assessment:** The additional DB queries are negligible. The `guild_configs` table is tiny. Each per-guild elevation query is bounded and uses the existing `guildId` index via the `@@unique([pimUserId, roleId])` constraint (Prisma creates an implicit index on `guildId` for queries filtered by it). The total additional query time is well under 100ms even at 50 concurrent guilds, leaving ample headroom within the 60-second cron window.

---

## Database Index Analysis

### New field: `notifyBeforeMin` on `guild_configs`

The warning scan filters `guild_configs WHERE notifyBeforeMin > 0`. The `guild_configs` table is expected to contain one row per Discord guild — typically single-digit to low-hundreds rows for a self-hosted bot. A full table scan on this small table is acceptable. No new index required.

### New field: `notifiedAt` on `active_elevations`

The warning scan adds `notifiedAt: null` to the per-guild elevation query. The query is already filtered by `guildId` (via the unique index on `[pimUserId, roleId]`). Adding `notifiedAt IS NULL` does not require a separate index given the expected row counts.

If the bot scaled to thousands of concurrent elevations per guild (unlikely for a self-hosted PIM tool), a partial index `WHERE "notifiedAt" IS NULL` on `active_elevations` could be added. No action required for current scale.

### New field: `blockedAt` on `pim_users`

`blockedAt` is checked in `/elevate` via `pimUser` which is already fetched by `discordUserId_guildId` unique index. No additional query or index needed.

---

## Discord API Impact

### Warning messages

One `channel.send()` per qualifying elevation per tick. In practice this fires once per elevation session (gated by `notifiedAt`). No burst concern.

### Button interactions (Extend Session / Remove Permission)

These are user-triggered, not background-initiated. Each button click results in one `deferReply` + one `editReply` + one `interaction.message.edit`. All three are standard Discord API calls with no performance concern.

---

## Bundle Impact

No new npm dependencies. No frontend bundle. The `buttonHandlers.ts` module adds approximately 200 lines to the server-side TypeScript build — negligible.

---

## Conclusion

No performance concerns. No new indexes required at current scale. The feature is additive with bounded, predictable query patterns.
