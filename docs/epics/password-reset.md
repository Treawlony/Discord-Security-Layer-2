# Epic: Self-Service Password Reset via Admin

## Overview

**Epic ID:** PIM-003
**Status:** Proposed
**Priority:** High
**Target Version:** v0.2.0

## Business Value

Currently, if a user forgets their PIM password, there is no safe recovery path within the bot. The only option is for a server administrator to directly mutate the `pim_users` table in PostgreSQL — a risky, manual, unaudited action that requires direct database access and bypasses all security controls.

This creates three compounding problems:

1. **Operational risk** — Direct DB access is error-prone and may accidentally corrupt related records (EligibleRole, ActiveElevation).
2. **Audit gap** — The event is invisible to the bot's audit log, violating the immutable audit trail guarantee.
3. **Access bottleneck** — Organisations may not want to grant DB credentials to all admins, leaving users permanently locked out until someone with DB access intervenes.

A dedicated `/watchtower-reset-password` admin command resolves all three problems: it is safe, scoped to the guild, audited, and requires only the Watchtower Admin Discord role.

## Success Metrics

- Zero need for direct DB access to recover a forgotten password
- Every password reset appears in the `audit_logs` table with `eventType = PASSWORD_RESET`
- Every password reset appears in the configured audit channel
- Users who have had their password reset receive a clear, actionable error message when they next attempt to `/elevate`
- No existing admin or user flows are broken by the change
- All existing tests continue to pass after the migration

## Scope

### In Scope

- New admin slash command `/watchtower-reset-password user:@user`
- New `AuditEventType` enum value: `PASSWORD_RESET`
- Schema change: `passwordHash` field on `PimUser` becomes nullable (`String?`) to represent the "password cleared" sentinel state
- Migration: add a Prisma migration to make `passwordHash` nullable
- Guard in `/elevate`: detect `passwordHash IS NULL` and return a clear error directing the user to `/set-password`
- `/set-password` works unchanged when `passwordHash IS NULL` (it already handles existing records via upsert)
- Update `help.ts` static embed to include the new command
- Audit log written to DB and echoed to the audit channel

### Out of Scope

- Self-service password reset initiated by the user (e.g. via email or DM challenge) — no such mechanism exists in Discord
- Any automated notification to the target user via DM (Discord's DM delivery is unreliable; the admin is expected to inform the user through normal server communication)
- Temporary one-time passwords or token-based resets
- Any change to `/set-password` behaviour beyond what is needed to handle a null hash

## Constraints and Assumptions

- Must follow all CLAUDE.md conventions (ephemeral replies, `isWatchtowerAdmin` gate, audit log, guild isolation)
- `passwordHash` is currently `String` (non-nullable) in Prisma schema; changing it to `String?` requires a Prisma migration and a corresponding SQL migration file
- No breaking change to other existing features: `set-password`, `elevate`, `assign`, `revoke`, `unlock`, `list`, `config` must all continue to work correctly
- The admin does **not** set a new password on behalf of the user — they only clear the existing one, forcing the user to choose their own

## Stakeholders

- **Discord server administrators** — primary users of the new command
- **End users with PIM accounts** — recipients of the reset (affected indirectly)
- **Watchtower operators** — benefit from audit trail completeness
