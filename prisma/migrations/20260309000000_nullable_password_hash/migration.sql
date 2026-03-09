-- Migration: nullable_password_hash
-- Makes passwordHash nullable on pim_users to support admin-initiated password reset.
-- Adds PASSWORD_RESET to the AuditEventType enum.
-- All column names are camelCase per project convention.

-- Allow NULL in passwordHash (existing rows are unaffected — their non-null values remain intact)
ALTER TABLE "pim_users" ALTER COLUMN "passwordHash" DROP NOT NULL;

-- Add new audit event type
ALTER TYPE "AuditEventType" ADD VALUE 'PASSWORD_RESET';
