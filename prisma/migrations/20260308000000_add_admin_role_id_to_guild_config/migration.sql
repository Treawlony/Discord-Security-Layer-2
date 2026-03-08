-- Migration: add_admin_role_id_to_guild_config
-- Adds the Watchtower Admin role ID to guild configuration.
-- Nullable column: existing rows default to NULL (bootstrap mode — Administrator fallback).

ALTER TABLE "guild_configs" ADD COLUMN "admin_role_id" TEXT;

-- Add new audit event type for when the admin role is configured
ALTER TYPE "AuditEventType" ADD VALUE 'ADMIN_ROLE_CONFIGURED';
