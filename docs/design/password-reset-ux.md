# UX Specification: Self-Service Password Reset via Admin

**Feature:** PIM-003 — `/watchtower-reset-password`
**Author:** UX Designer
**Date:** 2026-03-09

---

## Design Principles

This feature is purely command-driven (slash commands + ephemeral text replies). Discord Watchtower has no graphical UI beyond the Discord client itself. All interactions are ephemeral text messages visible only to the invoking user, consistent with every other admin and user command in the system.

---

## User Flows

### Flow A: Admin — Happy Path (user has a PIM account)

```
Admin types /watchtower-reset-password
         |
         v
Discord shows user option (required, type: User)
         |
         v
Admin selects target user, submits
         |
         v
Bot defers reply (ephemeral, <3 s)
         |
         v
Bot verifies admin has Watchtower Admin role
         |
         v
Bot locates PimUser record for target in this guild
         |
         v
Bot clears passwordHash (null), lockedAt (null),
blockedAt (null), failedAttempts (0) in one update
         |
         v
Bot writes PASSWORD_RESET audit log
         |
         v
Admin sees ephemeral confirmation (see Screen A1)
```

### Flow B: Admin — Target user has no PIM account

```
Admin submits /watchtower-reset-password @user
         |
         v
Bot defers reply (ephemeral)
         |
         v
Bot verifies admin role -- passes
         |
         v
Bot looks up PimUser -- NOT FOUND
         |
         v
Admin sees ephemeral error (see Screen B1)
         |
         v
[END -- no audit log written]
```

### Flow C: Non-admin attempts the command

```
Non-admin submits /watchtower-reset-password @user
         |
         v
Bot defers reply (ephemeral)
         |
         v
isWatchtowerAdmin() returns false
         |
         v
Non-admin sees ephemeral permission error (see Screen C1)
         |
         v
[END -- no audit log written]
```

### Flow D: User attempts /elevate after their password was reset

```
User submits /elevate password:<anything>
         |
         v
Bot defers reply (ephemeral)
         |
         v
Bot fetches PimUser -- found
         |
         v
Check lockedAt -- null, pass
         |
         v
Check blockedAt -- null, pass
         |
         v
Check passwordHash -- NULL detected (Screen D1)
         |
         v
[END -- no failed-attempt recorded, no lockout triggered]
```

### Flow E: User successfully recovers via /set-password after reset

```
User sees Screen D1, understands they must set a password
         |
         v
User runs /set-password password:<new_password>
         |
         v
Existing PimUser record found, passwordHash updated
         |
         v
PASSWORD_CHANGED audit log written
         |
         v
User sees: "Your PIM password has been updated."
         |
         v
User runs /elevate -- succeeds as normal
```

---

## Screen Specifications

### Screen A1 — Admin: Successful Reset (ephemeral)

**Trigger:** Happy path; `PimUser` found and updated.

**Recipient:** Admin who ran the command only (ephemeral).

**Content:**
```
<@TARGET_USER_ID>'s PIM password has been reset. They must run /set-password before they can elevate again.
```

**Notes:**
- Uses a Discord user mention (`<@id>`) so the admin can visually confirm the correct user.
- Plain text, no embed — consistent with all other admin command replies in the codebase.
- No mention of what the password was set to (it is now null — there is no new password to reveal).

---

### Screen B1 — Admin: Target Has No PIM Account (ephemeral)

**Trigger:** No `PimUser` record exists for the target user in this guild.

**Recipient:** Admin only (ephemeral).

**Content:**
```
<@TARGET_USER_ID> does not have a PIM account.
```

**Notes:**
- Identical phrasing to the equivalent error in `/watchtower-unlock` for consistency.
- No audit log entry is written (nothing was changed).

---

### Screen C1 — Non-Admin: Permission Denied (ephemeral)

**Trigger:** `isWatchtowerAdmin()` returns false.

**Recipient:** The non-admin user who invoked the command (ephemeral).

**Content:**
```
You do not have permission to use this command.

A Watchtower Admin role is required. Contact your server owner to be assigned the correct role.
```

**Notes:**
- Identical phrasing to the same error in all other admin commands — no deviation.

---

### Screen D1 — User: Password Has Been Reset, Must Set New Password (ephemeral)

**Trigger:** User runs `/elevate` when `PimUser.passwordHash IS NULL`.

**Recipient:** The user running `/elevate` (ephemeral).

**Content:**
```
Your PIM password has been reset by an administrator. Please run /set-password to set a new password before you can elevate.
```

**Notes:**
- Actionable: tells the user exactly what command to run.
- Does not say who reset the password (no need to expose admin identity; the user can ask an admin directly).
- Does not trigger `FAILED_ATTEMPT` or lockout — this is not an authentication failure.

---

### Audit Channel Post — PASSWORD_RESET Event

**Trigger:** Successful reset; `writeAuditLog` echoes to the configured audit channel.

**Recipient:** Configured audit channel (admin-facing).

**Content (generated by `writeAuditLog` in `audit.ts`):**
```
🔑 `PASSWORD_RESET` — <@TARGET_USER_ID> — <t:UNIX_TIMESTAMP:R>
```

**Notes:**
- The emoji mapping for `PASSWORD_RESET` should be `🔑` (key) — signals a credential event.
- No `skipChannelPost` — the standard `writeAuditLog` echo is the only message posted; there are no interactive buttons for this event.
- Posted to `auditChannelId` only (admin-facing channel per CLAUDE.md convention — this is an admin action, not a user-facing notification).

---

## Accessibility Requirements

Discord's slash command interface is natively accessible via keyboard and screen reader. The following requirements apply:

1. **All user-facing text must be plain English** — no jargon, no raw IDs in human-facing copy.
2. **User mentions** (`<@id>`) render as the user's display name in Discord clients — preferred over showing raw IDs.
3. **Ephemeral replies** are inherently private and reduce noise for other server members.
4. **No image, embed colour, or icon** is used — plain text is maximally compatible across all Discord client versions and accessibility tools.
5. **Error messages must be actionable** — every error screen tells the reader what went wrong and (where applicable) what to do next.

---

## Copy Consistency Audit

| Scenario | This feature's copy | Matching existing command |
|---|---|---|
| No PIM account | `does not have a PIM account.` | `/watchtower-unlock` — exact match |
| No permission | `You do not have permission...` | All admin commands — exact match |
| Success confirmation | `<@user>'s PIM password has been reset. They must run /set-password before they can elevate again.` | New — no prior template; follows the pattern of `/watchtower-unlock`'s success reply |
| User-facing reset block | `Your PIM password has been reset by an administrator. Please run /set-password...` | New — analogous to the `lockedAt` and `blockedAt` messages in `/elevate` |

---

## No New UI Components

This feature introduces no new Discord UI components (no buttons, no select menus, no modals). All interactions are command invocation + ephemeral text reply. This is consistent with the existing admin command suite and minimises interaction complexity.
