# UX Specification: Role Expiry Notifications

**Feature:** role-expiry-notifications
**Date:** 2026-03-08
**Stories Covered:** STORY-001 through STORY-007

---

## Design Principles

1. **No new surfaces**: all new messages appear in the existing audit log channel, minimising channel noise.
2. **Contextual action**: buttons appear exactly where the admin or user is already looking.
3. **Zero re-authentication for extension**: "Extend Session" is a one-click action gated by Discord identity, not a password re-entry.
4. **Fail gracefully and silently**: missing channel, expired record, or wrong user — all produce an ephemeral error to the actor only.
5. **Accessibility**: button labels are plain text (no emoji-only labels); all colours use Discord's semantic palette.

---

## User Flows

### Flow A — Happy path: user extends session

```
[5 min before expiry — cron tick]
  Bot posts to #watchtower-audit:
    "@Alice, your Server Admin elevation expires <t:UNIX:R>. Click below to extend."
    [Extend Session]  ← green/primary button

[Alice clicks "Extend Session"]
  Bot replies ephemerally to Alice:
    "Your Server Admin elevation has been extended until <t:NEW_UNIX:R>."
  Original message updated:
    Buttons removed; message text unchanged (timestamp auto-updates via Discord).

[~5 min before new expiry — cron tick]
  Warning fires again (notifiedAt was cleared on extension).
```

### Flow B — Session expires without extension

```
[5 min before expiry — cron tick]
  Bot posts warning message with [Extend Session] button.

[Expiry cron tick — button is now stale]
  Bot removes role, deletes ActiveElevation record.

[Alice clicks stale "Extend Session"]
  Bot replies ephemerally to Alice:
    "This elevation has already expired."
  (No crash; original message is not modified since record is gone.)
```

### Flow C — Admin removes permission from elevation-granted message

```
[Elevation granted — elevate.ts]
  Bot posts to #watchtower-audit:
    "⬆️ PIM Elevation — @Alice has been granted Server Admin until <t:UNIX:R>."
    [Remove Permission]            ← red/danger button
    [Remove Permission and Block]  ← red/danger button

[Admin @Bob clicks "Remove Permission"]
  Bot checks isWatchtowerAdmin(Bob). Passes.
  Bot removes role from Alice.
  Bot deletes ActiveElevation record.
  Bot replies ephemerally to Bob:
    "Server Admin has been removed from @Alice."
  Original message: buttons removed/disabled.
  Audit log: ELEVATION_ADMIN_REVOKED written.

[Non-admin @Carol clicks "Remove Permission"]
  Bot checks isWatchtowerAdmin(Carol). Fails.
  Bot replies ephemerally to Carol:
    "You do not have permission to use this control."
  Original message: unchanged.
```

### Flow D — Admin removes permission and blocks

```
[Admin @Bob clicks "Remove Permission and Block"]
  Bot checks isWatchtowerAdmin(Bob). Passes.
  Bot removes role from Alice.
  Bot deletes ActiveElevation record.
  Bot sets PimUser.blockedAt = now.
  Bot replies ephemerally to Bob:
    "Server Admin has been removed from @Alice and their PIM account has been blocked."
  Original message: buttons removed/disabled.
  Audit logs: ELEVATION_ADMIN_REVOKED_BLOCKED + ELEVATION_BLOCKED written.

[Alice runs /elevate later]
  Bot replies ephemerally:
    "Your PIM account has been blocked by an administrator. Contact a Watchtower Admin."

[Admin @Bob runs /watchtower-unlock @Alice]
  Bot clears lockedAt, failedAttempts, and blockedAt.
  Bot replies ephemerally to Bob:
    "@Alice's PIM account has been unlocked."
  Audit log: ACCOUNT_UNLOCKED with metadata { clearedBlock: true }.
```

### Flow E — Warning with no audit channel configured

```
[Cron tick — notifyBeforeMin = 5, auditChannelId = null]
  Warning scan runs; qualification check fails at auditChannelId IS NULL gate.
  No message sent. No error logged. Cron continues silently.
```

### Flow F — notify-before = 0 (notifications disabled)

```
[Cron tick — notifyBeforeMin = 0]
  Warning scan skips immediately (notifyBeforeMin > 0 check fails).
  No messages sent.
```

---

## Message Specifications

### Message 1: Expiry Warning (posted to auditChannelId)

```
Content:
  ⏰ <@USER_ID>, your **ROLE_NAME** elevation expires <t:UNIX_TIMESTAMP:R>.
  Click **Extend Session** to reset your timer.

Components (ActionRow):
  [Extend Session]
    style: ButtonStyle.Primary (blue)
    customId: "extend_session:<elevationId>"
```

Design notes:
- User ping is in the message content (not an embed) so Discord sends the user a mention notification.
- Relative timestamp auto-updates in the Discord client.
- Single button only — no other actions available to a regular user.

### Message 2: Elevation Granted (posted to auditChannelId, replaces plain alertChannelId post)

```
Content:
  ⬆️ **PIM Elevation** — <@USER_ID> has been granted **ROLE_NAME** until <t:UNIX_TIMESTAMP:R>

Components (ActionRow):
  [Remove Permission]             style: ButtonStyle.Danger  customId: "remove_perm:<elevationId>"
  [Remove Permission and Block]   style: ButtonStyle.Danger  customId: "remove_perm_block:<elevationId>"
```

Design notes:
- Both buttons are Danger (red) because both are destructive admin actions.
- Message content (not embed) so the alert is immediately visible in the channel preview.
- If `auditChannelId` is null but `alertChannelId` is set, post plain text to `alertChannelId` without buttons (buttons require a channel message; we cannot guarantee `alertChannelId` is the audit log channel).

### Message 3: Ephemeral — Extend Session confirmed

```
"Your **ROLE_NAME** elevation has been extended until <t:NEW_UNIX:R>."
flags: MessageFlags.Ephemeral
```

### Message 4: Ephemeral — Remove Permission confirmed

```
"**ROLE_NAME** has been removed from <@USER_ID>."
flags: MessageFlags.Ephemeral
```

### Message 5: Ephemeral — Remove Permission and Block confirmed

```
"**ROLE_NAME** has been removed from <@USER_ID> and their PIM account has been blocked. Use `/watchtower-unlock` to restore access."
flags: MessageFlags.Ephemeral
```

### Message 6: Ephemeral — Error: elevation already ended

```
"This elevation has already expired or been revoked."
flags: MessageFlags.Ephemeral
```

### Message 7: Ephemeral — Error: wrong user on Extend Session

```
"Only the elevated user can extend their own session."
flags: MessageFlags.Ephemeral
```

### Message 8: Ephemeral — Error: not an admin on Remove buttons

```
"You do not have permission to use this control. A Watchtower Admin role is required."
flags: MessageFlags.Ephemeral
```

### Message 9: Ephemeral — /elevate blocked user

```
"Your PIM account has been blocked by an administrator. Contact a Watchtower Admin to restore access."
flags: MessageFlags.Ephemeral
```

---

## /watchtower-config Embed Update

The existing config view embed gains one new field:

```
{ name: "Expiry Warning", value: "<N> minutes before expiry (0 = disabled)", inline: true }
```

Placement: after "Session Duration", before "Lockout Threshold" (session-related settings grouped together).

Caution note in reply content (not embed) when `notifyBeforeMin > sessionDurationMin`:
```
"Note: notify-before (<N> min) exceeds session-duration (<M> min). The warning will fire on the first cron tick after every new elevation."
```

---

## /help Embed Update

Under "Admin Commands":
```
`/watchtower-config` — View or update session duration, lockout threshold, expiry warning timing, and logging channels.
```

(Replace existing description which omits the warning option.)

---

## Accessibility

- All buttons use text labels only (no emoji-only). Screen reader users receive the label verbatim.
- Ephemeral replies ensure no sensitive information is visible to other channel members.
- Discord timestamps (`<t:UNIX:R>`) render in the user's local timezone automatically.
- Danger-style buttons (red) provide a visual affordance that "Remove Permission" is a destructive action.
- Button labels are concise (under 80 characters per Discord limit).
