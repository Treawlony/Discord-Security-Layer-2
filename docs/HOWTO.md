# Discord Watchtower — How to Use the Bot

Discord Watchtower is a **Privileged Identity Manager (PIM)** bot. Instead of assigning powerful roles permanently, admins control which roles each user is *eligible* for. Users authenticate with a personal password to temporarily claim a role, which is automatically removed when the session expires.

---

## Quick Concept

```
Admin assigns eligibility → User sets a password → User elevates → Role granted for N minutes → Role auto-removed
```

---

## For Admins

Admins are users with the **Manage Roles** or **Administrator** Discord permission.

---

### Assign role eligibility to a user

```
/watchtower-assign user:@Username role:@RoleName
```

Grants `@Username` the ability to elevate into `@RoleName`. The user must have already set a password with `/set-password` before you can assign them.

---

### Remove role eligibility from a user

```
/watchtower-revoke user:@Username role:@RoleName
```

Removes the eligibility. If the user currently has the role via an active elevation session, the role is removed immediately.

---

### View all assignments

```
/watchtower-list
```

Shows every user with at least one eligible role in this server, along with their active elevation status.

---

### Unlock a locked-out user

```
/watchtower-unlock user:@Username
```

If a user exceeds the failed-attempt threshold, their account is locked. This command resets the lockout so they can try again.

---

### View or change server settings

```
/watchtower-config
```

Displays current settings for this server:
- **Session duration** — how long (in minutes) an elevation lasts before the role is auto-removed
- **Lockout threshold** — how many failed password attempts trigger a lockout
- **Alert channel** — channel where elevation events are posted
- **Audit channel** — channel where all audit log entries are posted

To update a setting, pass the relevant option:

```
/watchtower-config session-duration:30
/watchtower-config lockout-threshold:3
/watchtower-config alert-channel:#security-alerts
/watchtower-config audit-channel:#audit-log
```

---

## For Users

### Step 1 — Set your PIM password

Before you can elevate, you need a password. This is separate from your Discord account password.

```
/set-password password:YourPassword123!
```

Password requirements:
- At least 8 characters
- At least one uppercase letter
- At least one lowercase letter
- At least one number
- At least one special character (e.g. `!@#$%^&*`)

You can run this command again at any time to change your password.

> All replies are private (ephemeral) — only you can see them.

---

### Step 2 — Elevate into a role

```
/elevate
```

The bot will ask for your password. Enter it, then select the role you want from the dropdown menu. The role is granted immediately and will be automatically removed when your session expires.

The session duration is set by your server admin (default: 60 minutes).

---

### What happens when the session expires?

Nothing you need to do — the bot removes the role automatically. You will not receive a notification, but you can run `/elevate` again whenever you need the role.

---

## Security Notes

- **Passwords are never stored in plaintext** — they are hashed with bcrypt.
- **Too many wrong passwords** will lock your account. Contact an admin to unlock it.
- **Every elevation and de-elevation is logged** to the server's audit log.
- **All bot replies are ephemeral** — your password and role selections are never visible to other users.

---

## Command Reference

| Command | Who | Description |
|---|---|---|
| `/set-password` | User | Register or change your PIM password |
| `/elevate` | User | Authenticate and temporarily claim an eligible role |
| `/watchtower-assign` | Admin | Grant a user eligibility for a role |
| `/watchtower-revoke` | Admin | Remove a user's eligibility for a role |
| `/watchtower-list` | Admin | View all role assignments in this server |
| `/watchtower-unlock` | Admin | Unlock a locked-out user's PIM account |
| `/watchtower-config` | Admin | View or update server-level PIM settings |

---

## Typical Workflow Example

1. Admin: `/watchtower-config audit-channel:#audit-log` — set up logging
2. Admin: `/watchtower-assign user:@Alice role:@Moderator` — Alice gets eligibility
3. Alice: `/set-password password:MyS3cur3P@ss!` — Alice sets her password
4. Alice: `/elevate` → enters password → selects `@Moderator` → role granted for 60 min
5. *(60 minutes later)* — bot removes `@Moderator` from Alice automatically
6. Alice: `/elevate` again whenever she needs it
