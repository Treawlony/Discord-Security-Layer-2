# Changelog

All notable changes to Discord Watchtower will be documented in this file.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [Unreleased]

### Security
- **Watchtower Admin Role** — Replaced reliance on Discord's `Manage Roles` / `Administrator`
  permission as the bot management gate with a dedicated, configurable Watchtower Admin role.
  A runtime `isWatchtowerAdmin()` guard is now enforced in all five admin commands server-side.
  Users with `Manage Roles` (including temporarily elevated users) can no longer manage the bot
  unless they hold the designated Watchtower Admin role.

### Added
- `src/lib/permissions.ts` — new `isWatchtowerAdmin(member, config)` helper.
  Bootstrap mode: when no admin role is configured, falls back to Discord `Administrator`.
  Configured mode: Watchtower Admin role is the sole gate — `Administrator` alone is denied.
- `GuildConfig.adminRoleId` — new optional field in the Prisma schema storing the Discord role
  ID of the designated Watchtower Admin role (null = not yet configured).
- `AuditEventType.ADMIN_ROLE_CONFIGURED` — new audit event emitted when the admin role is
  set or changed via `/watchtower-config`.
- Prisma migration `20260308000000_add_admin_role_id_to_guild_config` — non-destructive nullable
  column addition; existing guilds default to null (bootstrap mode).
- `/watchtower-config admin-role:@role` — new optional role option on the config command.
  Lets the server owner designate the Watchtower Admin role. Displays current value in the
  config embed and shows a warning when changed.
- `tests/permissions.test.ts` — 15 unit tests for `isWatchtowerAdmin()` covering all branches.
- `tests/admin-guard.test.ts` — 49 structural tests verifying the guard is correctly present
  in every admin command, the elevate filter is in place, and audit enrichment is applied.

### Changed
- `src/commands/admin/assign.ts` — runtime `isWatchtowerAdmin` guard added; audit metadata
  enriched with `isWatchtowerAdmin: true`; warns if an admin attempts to assign PIM eligibility
  for the Watchtower Admin role itself.
- `src/commands/admin/revoke.ts` — runtime `isWatchtowerAdmin` guard added; audit metadata
  enriched on both `ELIGIBILITY_REVOKED` and `ELEVATION_REVOKED` events.
- `src/commands/admin/list.ts` — runtime `isWatchtowerAdmin` guard added.
- `src/commands/admin/unlock.ts` — runtime `isWatchtowerAdmin` guard added; audit metadata
  enriched with `isWatchtowerAdmin: true`.
- `src/commands/admin/config.ts` — runtime `isWatchtowerAdmin` guard added; new `admin-role`
  option; embed updated to show "Admin Role" field; `ADMIN_ROLE_CONFIGURED` audit log emitted.
- `src/commands/user/elevate.ts` — eligible roles are now filtered to exclude the Watchtower
  Admin role before the selection menu is built. Users cannot elevate to the admin role.

### Added
- `/help` slash command (`src/commands/user/help.ts`): ephemeral embed listing
  all available commands grouped by audience (Admin / User), a PIM concept
  explanation, and a Getting Started sequence for new users.
- Jest test suite (`tests/help-command.test.ts`): 16 unit tests covering
  command metadata, interaction lifecycle, embed content, and absence of
  database usage.
- `jest.config.js`: Jest + ts-jest configuration.
- `npm run test` script in `package.json`.

### Changed
- `CLAUDE.md` — "Adding New Commands" section now includes a reminder to
  update `src/commands/user/help.ts` when a new command is introduced.
