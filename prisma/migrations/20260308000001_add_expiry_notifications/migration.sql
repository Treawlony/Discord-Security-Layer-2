-- Migration: add_expiry_notifications
-- Adds notifyBeforeMin to guild_configs, notifiedAt to active_elevations,
-- blockedAt to pim_users, and five new AuditEventType enum values.
-- All column names are camelCase per project convention.

-- Add notifyBeforeMin to guild_configs (NOT NULL, default 5 — existing guilds opt in)
ALTER TABLE "guild_configs" ADD COLUMN "notifyBeforeMin" INTEGER NOT NULL DEFAULT 5;

-- Add notifiedAt to active_elevations (nullable — existing sessions not yet warned)
ALTER TABLE "active_elevations" ADD COLUMN "notifiedAt" TIMESTAMP(3);

-- Add blockedAt to pim_users (nullable — no existing users are blocked)
ALTER TABLE "pim_users" ADD COLUMN "blockedAt" TIMESTAMP(3);

-- Add new AuditEventType enum values
ALTER TYPE "AuditEventType" ADD VALUE 'ELEVATION_EXPIRY_WARNING';
ALTER TYPE "AuditEventType" ADD VALUE 'ELEVATION_EXTENDED';
ALTER TYPE "AuditEventType" ADD VALUE 'ELEVATION_ADMIN_REVOKED';
ALTER TYPE "AuditEventType" ADD VALUE 'ELEVATION_ADMIN_REVOKED_BLOCKED';
ALTER TYPE "AuditEventType" ADD VALUE 'ELEVATION_BLOCKED';
