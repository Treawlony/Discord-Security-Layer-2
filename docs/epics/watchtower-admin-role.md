# Epic: Watchtower Admin Role — Decoupled Bot Management Permissions

**Date:** 2026-03-08
**Status:** In Progress
**Priority:** P0 — Security Critical

---

## Problem Statement

Discord Watchtower currently gates all bot management commands behind Discord's native `Manage Roles` or `Administrator` permissions. Because Watchtower itself grants powerful roles temporarily, there is a privilege escalation path: a user who is elevated to a role that carries `Manage Roles` can immediately begin managing the bot. This breaks the security model the bot is designed to enforce.

## Business Value

- Closes a privilege-escalation vector in the PIM itself
- Gives server owners explicit, auditable control over who manages Watchtower
- Decouples bot management access from Discord's broad permission model
- Allows organisations to follow least-privilege principles at the bot-management layer, not just the user-elevation layer

## Success Metrics

1. A user holding `Manage Roles` but not the designated Watchtower Admin role receives a "permission denied" ephemeral reply on every admin command — verified by manual test and automated integration test.
2. Server owner (Discord `Administrator`) can always run `/watchtower-config` when no admin role is configured (bootstrap path works).
3. The Watchtower Admin role never appears in any user's elevation dropdown.
4. All admin actions include `isWatchtowerAdmin: true` in their audit log metadata.
5. Zero regression on existing user-facing commands (`/elevate`, `/set-password`).

## Scope

### In Scope
- Add `adminRoleId String?` to `GuildConfig` schema + migration
- New `isWatchtowerAdmin()` shared helper in `src/lib/`
- Replace `setDefaultMemberPermissions` as security gate with runtime `isWatchtowerAdmin()` checks in all five admin commands
- Extend `/watchtower-config` with a new `admin-role` option (role picker) so the server owner can designate the role
- Filter the Watchtower Admin role out of the `/elevate` role selection menu
- Enrich all admin-command audit log entries with `isWatchtowerAdmin` flag in metadata
- Add new `ADMIN_ROLE_CONFIG` audit event type for when the admin role is set or cleared

### Out of Scope
- Tiered admin levels (e.g. read-only vs. write admin)
- Changes to the elevation or authentication flow beyond the admin-role filter
- UI changes to the `/elevate` command beyond role filtering

## Constraints & Design Decisions

| Constraint | Decision |
|---|---|
| Bootstrap problem | When `adminRoleId` is null, fall back to Discord `Administrator` permission so owner can configure the bot on a fresh install |
| `setDefaultMemberPermissions` is UI-only | Keep it on commands for UX (hides command from non-privileged users in Discord UI) but it is NOT the security gate — runtime check is |
| Single source of truth for admin check | `isWatchtowerAdmin()` in `src/lib/permissions.ts` — all five admin commands import and call it identically |
| Non-breaking migration | `adminRoleId` is nullable; existing guilds simply fall back to Administrator check until configured |

## Risks

| Risk | Mitigation |
|---|---|
| Owner locks themselves out by setting a non-existent role | Validate role exists in guild at config time; show current value in embed so owner can see and correct |
| Race condition: role deleted after being set as admin role | `isWatchtowerAdmin()` gracefully degrades to Administrator fallback if role fetch fails |
| Watchtower Admin role inadvertently assignable via PIM | Filter it out in `/elevate` dropdown; also warn in `/watchtower-assign` if an admin tries to make it eligible |

## Dependencies

- Prisma migration (database change required before code change)
- No external service changes
