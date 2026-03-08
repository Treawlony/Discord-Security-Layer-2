# UX Specification: /help Command

## User Flows

### Flow 1 — Regular User
1. User types `/help` in any channel.
2. Discord shows the command in the autocomplete popup.
3. User presses Enter.
4. Bot defers the reply (ephemeral).
5. Bot sends an ephemeral embed back to the user only.
6. User reads the embed and self-serves.

### Flow 2 — Admin User
Same as Flow 1. The single `/help` response includes both the Admin and
User sections, so admins see everything in one place.

---

## Wireframe Specification

The response is a single Discord EmbedBuilder with the following structure.

```
+-------------------------------------------------------+
| [EMBED — colour: #5865F2 (Discord Blurple)]            |
|                                                         |
| TITLE: "Discord Watchtower — Help"                      |
|                                                         |
| DESCRIPTION (2-3 lines):                               |
|   Discord Watchtower is a Privileged Identity Manager   |
|   (PIM) bot. Instead of permanent powerful roles,       |
|   eligible users can temporarily elevate to a role      |
|   for a configured duration, then it is auto-removed.   |
|                                                         |
| FIELD — "Getting Started (Users)"  [not inline]        |
|   1. Run /set-password to create your PIM account.     |
|   2. Ask an admin to run /watchtower-assign for you.   |
|   3. Run /elevate and enter your password to gain a    |
|      temporary role.                                    |
|                                                         |
| FIELD — "User Commands"  [not inline]                  |
|   /set-password  — Set or change your PIM password.    |
|                    Run this first before anything else.  |
|   /elevate       — Authenticate and gain a temporary   |
|                    elevated role from your eligible set. |
|   /help          — Show this help message.             |
|                                                         |
| FIELD — "Admin Commands"  [not inline]                 |
|   (Require Manage Roles or Administrator permission)    |
|   /watchtower-assign  — Grant role eligibility to a    |
|                          user.                          |
|   /watchtower-revoke  — Remove eligibility and end     |
|                          any active elevation session.  |
|   /watchtower-list    — View all PIM assignments in    |
|                          this server.                   |
|   /watchtower-unlock  — Clear account lockout after    |
|                          too many failed attempts.      |
|   /watchtower-config  — View or update session         |
|                          duration, lockout threshold,   |
|                          and logging channels.          |
|                                                         |
| FOOTER: "Only you can see this message."               |
| TIMESTAMP: current timestamp                            |
+-------------------------------------------------------+
```

### Colour rationale
`#5865F2` is Discord Blurple — a neutral, branded choice that doesn't
suggest an error (red) or success (green) state. Help is informational.

### Formatting choices
- Backtick inline code for command names so they render as code spans
  in Discord, making them visually distinct and familiar.
- Field names in bold by default via EmbedBuilder.
- Footer reinforces ephemeral nature for users unfamiliar with ephemeral
  messages.
- Timestamp so users can see the information is current.

---

## Accessibility Requirements

- Do not rely on colour alone to convey meaning — text labels differentiate
  admin vs user commands explicitly.
- Keep line length reasonable — Discord embeds wrap at ~350px; content is
  written to avoid long unbroken lines.
- No animated content, GIFs, or image attachments — keeps the response
  lightweight and screen-reader friendly.
- All command names rendered in backticks are still plain text; screen
  readers will read them normally.

---

## Interaction Model

| Trigger | Response type | Visible to |
|---|---|---|
| `/help` invoked | Ephemeral embed | Invoking user only |

No buttons, no select menus, no collectors. This is a fire-and-forget
informational response. Users cannot interact further with it beyond
reading or dismissing.
