# Changelog

All notable changes to Discord Watchtower will be documented in this file.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [Unreleased]

---

## [0.0.1] — 2026-03-08

Initial public release. Core PIM flow, help command, and decoupled bot management permissions.

### Added
- Core PIM flow: `/set-password`, `/elevate` with role selection menu, automatic session expiry via cron job
- Admin commands: `/watchtower-assign`, `/watchtower-revoke`, `/watchtower-list`, `/watchtower-unlock`, `/watchtower-config`
- `/help` slash command — ephemeral embed listing all commands grouped by audience with a Getting Started guide
- `src/lib/permissions.ts` — `isWatchtowerAdmin(member, config)` helper with bootstrap fallback to Discord `Administrator`
- `GuildConfig.adminRoleId` — configurable Watchtower Admin role; null = bootstrap mode (Administrator fallback)
- `/watchtower-config admin-role:@role` option to designate the Watchtower Admin role
- `AuditEventType.ADMIN_ROLE_CONFIGURED` audit event
- Immutable audit log written to DB and optionally posted to a Discord channel
- Per-guild configuration: session duration, lockout threshold, alert channel, audit channel
- bcrypt password hashing (12 rounds) with Zod complexity validation
- Account lockout after configurable N failed attempts; `/watchtower-unlock` to recover
- Jest test suite (75 tests across `permissions.test.ts`, `admin-guard.test.ts`, `help-command.test.ts`)
- Docker + Docker Compose setup; Portainer GitOps deployment support
- Automatic global slash command registration on bot startup via `ready` event

### Security
- Runtime `isWatchtowerAdmin()` guard on all five admin commands — `Manage Roles` alone is insufficient
- Elevated users cannot inherit bot management access through the elevation flow
- Watchtower Admin role is filtered from the `/elevate` role selection menu
- Audit log enriched with `isWatchtowerAdmin` flag on every admin action
