# User Stories: Self-Service Password Reset via Admin

**Epic:** PIM-003 — Self-Service Password Reset via Admin
**Author:** Business Analyst
**Date:** 2026-03-09

---

## Process Flow

### Current State

```
User forgets password
        |
        v
User contacts admin
        |
        v
Admin accesses PostgreSQL directly
        |
        v
Admin manually deletes or mutates pim_users row  <-- unaudited, risky
        |
        v
User re-runs /set-password
        |
        v
Admin must re-run /watchtower-assign for all eligible roles (if row deleted)
```

### Future State

```
User forgets password
        |
        v
User contacts admin
        |
        v
Admin runs /watchtower-reset-password @user  <-- safe, audited, in-Discord
        |
        v
Bot clears passwordHash (null), clears lockedAt + failedAttempts, writes PASSWORD_RESET audit log
        |
        v
User re-runs /set-password (eligible roles are preserved)
        |
        v
User runs /elevate as normal
```

**Key improvement:** eligible roles are preserved across the reset — no need for the admin to re-grant them.

---

## User Stories

---

### STORY-01: Admin resets a user's PIM password

**As a** Watchtower Admin,
**I want to** run a single slash command to clear a user's PIM password,
**so that** the user can set a new one without requiring direct database access.

#### Acceptance Criteria

- AC-01.1: The command is named `/watchtower-reset-password` with a required `user` option of type User.
- AC-01.2: The command is in `src/commands/admin/` and auto-discovered by `commandLoader.ts`.
- AC-01.3: The command calls `isWatchtowerAdmin(member, config)` immediately after `deferReply`. Non-admins receive an ephemeral error and the command exits.
- AC-01.4: If the target user has no `PimUser` record in this guild, the bot replies ephemerally: `"<@user> does not have a PIM account."` and exits.
- AC-01.5: On success, the bot sets `passwordHash = null` on the `PimUser` record.
- AC-01.6: On success, the bot also clears `lockedAt`, `blockedAt`, and resets `failedAttempts` to 0 in the same DB update (a reset implies a clean slate).
- AC-01.7: The bot writes a `PASSWORD_RESET` audit log entry with metadata: `{ resetBy: admin_discord_user_id, isWatchtowerAdmin: true }`.
- AC-01.8: The bot replies ephemerally to the admin: `"<@user>'s PIM password has been reset. They must run /set-password before they can elevate again."`
- AC-01.9: The command has no `setDefaultMemberPermissions` call (per CLAUDE.md convention for admin commands).
- AC-01.10: All replies use `flags: MessageFlags.Ephemeral as number` (for `editReply`) per CLAUDE.md conventions.
- AC-01.11: The audit log event is echoed to the configured audit channel (no `skipChannelPost`).

---

### STORY-02: Schema — make passwordHash nullable

**As a** developer,
**I want to** make `PimUser.passwordHash` nullable in the Prisma schema,
**so that** the reset command has a safe, unambiguous sentinel value (NULL) that distinguishes "no password set" from any string value.

#### Acceptance Criteria

- AC-02.1: `PimUser.passwordHash` is changed from `String` to `String?` in `prisma/schema.prisma`.
- AC-02.2: A Prisma migration file is generated that ALTERs the `pim_users` table to allow NULL in the `"passwordHash"` column.
- AC-02.3: The migration SQL uses camelCase column names (e.g. `"passwordHash"`) per CLAUDE.md conventions.
- AC-02.4: The migration does not change any other columns or tables.
- AC-02.5: Running `npm run db:generate` after the schema change produces a valid Prisma client with `passwordHash: string | null`.

---

### STORY-03: Guard in /elevate for null password

**As a** user whose password has been reset,
**I want to** see a clear, actionable error when I try to /elevate without setting a password,
**so that** I know exactly what to do to restore my access.

#### Acceptance Criteria

- AC-03.1: In `src/commands/user/elevate.ts`, after the existing `lockedAt` and `blockedAt` checks, a new guard checks `pimUser.passwordHash === null`.
- AC-03.2: When the hash is null, the bot replies ephemerally: `"Your PIM password has been reset by an administrator. Please run /set-password to set a new password before you can elevate."`.
- AC-03.3: The guard executes before the password verification step (`verifyPassword`), so no bcrypt operation is attempted on a null value.
- AC-03.4: No `FAILED_ATTEMPT` or `ACCOUNT_LOCKED` events are written when the null-password guard fires.
- AC-03.5: The ordering of checks in `/elevate` is: lockedAt → blockedAt → passwordHash null → verifyPassword.

---

### STORY-04: /set-password continues to work after a reset

**As a** user whose password has been reset,
**I want to** run /set-password and have it work as if I am setting a new password,
**so that** I can regain access without admin intervention beyond the initial reset.

#### Acceptance Criteria

- AC-04.1: The existing `/set-password` command handles the case where `pimUser.passwordHash IS NULL` — the command's `existing` branch already does an `update`, so setting a new hash on a null-hash record works without code changes.
- AC-04.2: After setting a new password, the user can immediately run `/elevate` and authenticate successfully.
- AC-04.3: The audit event written is `PASSWORD_CHANGED` (the user had an existing PimUser record, so this is a change, not an initial set). This is correct and requires no code change to `set-password.ts`.
- AC-04.4: Eligible roles assigned to the user are fully preserved through the reset — the `EligibleRole` records are not touched.

---

### STORY-05: Update help embed

**As a** Discord user (admin or otherwise),
**I want** the `/help` command to list `/watchtower-reset-password`,
**so that** admins know the command exists without consulting external documentation.

#### Acceptance Criteria

- AC-05.1: `src/commands/user/help.ts` Admin Commands field is updated to include a line for `/watchtower-reset-password`.
- AC-05.2: The description reads: `` `/watchtower-reset-password` — Clear a user's PIM password, forcing them to run `/set-password` again. ``
- AC-05.3: The new line is appended after the existing `/watchtower-unlock` line.

---

## Data Requirements

| Field | Model | Change | Reason |
|---|---|---|---|
| `passwordHash` | `PimUser` | `String` → `String?` | Sentinel for "password cleared" state |

No new tables or new relations are required.

## New Enum Value

| Value | Enum | Description |
|---|---|---|
| `PASSWORD_RESET` | `AuditEventType` | Admin cleared a user's PIM password via `/watchtower-reset-password` |

## Edge Cases

| Scenario | Expected Behaviour |
|---|---|
| Admin resets their own password | Allowed — no special restriction. Admin is still subject to `isWatchtowerAdmin` check. |
| Target user has an active elevation session | Session is NOT terminated by the reset — only the password is cleared. The active session continues until natural expiry or admin revocation. |
| Target user has no PimUser record | Return ephemeral error: user has no PIM account. |
| Target user's account is already locked or blocked | Reset proceeds and clears all three fields (lockedAt, blockedAt, failedAttempts) in the same update. |
| Target user's passwordHash is already null (double reset) | Reset proceeds silently — the result is idempotent. Audit log is still written. |
| Bot lacks DB write permissions | Unhandled — Prisma will throw; the error propagates naturally and the user sees a Discord error. This is acceptable as it represents an infrastructure failure. |
| Admin runs command in DM (no guildId) | `interaction.guildId!` will throw — this is consistent with all other admin commands and is acceptable. |

## Out-of-Scope Notes

- No DM notification to the target user. Admins are expected to inform users via server channels or direct communication.
- No "reset token" or time-limited validity on the null state. The null hash persists until the user runs `/set-password`.
- No change to the lockout or block flow beyond clearing those fields as part of the reset.
