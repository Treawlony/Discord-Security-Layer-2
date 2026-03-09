# UX Specification: Discord Embed Notification System (EPIC-006)

## Design Goals

1. Every channel-posted message is visually consistent and scannable at a glance.
2. User IDs render as clickable `<@userId>` mentions inside embed content — no pings.
3. Colour communicates state immediately: green = active/granted, orange = warning,
   red = revoked/blocked, grey = neutral/ended.
4. Buttons remain visually attached to the embed that gives them context.
5. When a session ends, the original message updates in place — no orphaned messages.

---

## Colour Palette

| Colour | Hex | State |
|---|---|---|
| Green | `0x57F287` | Granted, active, extended |
| Orange | `0xFEE75C` | Warning, expiring soon |
| Red | `0xED4245` | Revoked, blocked |
| Grey | `0x95A5A6` | Neutral, ended, info |

These match Discord's brand colours for success/warning/danger and the existing
`/watchtower-config` embed which already uses `0x57F287` (green).

---

## User Flows

### Flow 1 — Elevation Granted

**Trigger:** User completes `/elevate` successfully.

**Audit channel (admin-facing):**

```
+----------------------------------------------------------+
|  [Green left border]                                     |
|  PIM Elevation Granted                                   |
|  --------------------------------------------------------|
|  User           Role              Expires                |
|  @Username      Moderator         in 1 hour              |
|  --------------------------------------------------------|
|  [Remove Permission]  [Remove Permission and Block]      |
+----------------------------------------------------------+
```

- Title: "PIM Elevation Granted"
- Colour: Green (`0x57F287`)
- Fields (inline):
  - "User" — `<@userId>`
  - "Role" — role name
  - "Expires" — `<t:unix:R>`
- Footer timestamp: set to `new Date()` (Discord renders as "Today at HH:MM")
- Components: Remove Permission (Danger) + Remove Permission and Block (Danger)

**Alert channel (user-facing):**

```
+----------------------------------------------------------+
|  [Green left border]                                     |
|  Role Elevated                                           |
|  @Username, you have been granted **Moderator**          |
|  until in 1 hour.                                        |
|  --------------------------------------------------------|
|  [Revoke Early]                                          |
+----------------------------------------------------------+
```

- Title: "Role Elevated"
- Colour: Green (`0x57F287`)
- Description: `<@userId>, you have been granted **{roleName}** until <t:unix:R>.`
- Footer timestamp: set to `new Date()`
- Components: Revoke Early (Secondary)

**Ephemeral reply to user (unchanged — private, not a channel post):**
```
You have been elevated to **Moderator** until <t:unix:R>.
```

---

### Flow 2 — Expiry Warning

**Trigger:** Cron job detects session within `notifyBeforeSec` of expiry; `notifiedAt` is null.

**Alert channel (user-facing):**

```
+----------------------------------------------------------+
|  [Orange left border]                                    |
|  Session Expiring Soon                                   |
|  @Username, your **Moderator** elevation expires         |
|  in 5 minutes. Click Extend Session to reset your timer. |
|  --------------------------------------------------------|
|  [Extend Session]                                        |
+----------------------------------------------------------+
```

- Title: "Session Expiring Soon"
- Colour: Orange (`0xFEE75C`)
- Description: `<@userId>, your **{roleName}** elevation expires <t:unix:R>. Click **Extend Session** to reset your timer.`
- Footer timestamp: set to `new Date()`
- Components: Extend Session (Primary)

**Audit channel (admin-facing):**

```
+----------------------------------------------------------+
|  [Orange left border]                                    |
|  Expiry Warning                                          |
|  --------------------------------------------------------|
|  User           Role              Expires                |
|  @Username      Moderator         in 5 minutes           |
+----------------------------------------------------------+
```

- Title: "Expiry Warning"
- Colour: Orange (`0xFEE75C`)
- Fields (inline):
  - "User" — `<@userId>`
  - "Role" — role name
  - "Expires" — `<t:unix:R>`
- Footer timestamp: set to `new Date()`
- No components (audit warning has no Extend Session button)

---

### Flow 3 — Extend Session

**Trigger:** User clicks "Extend Session" on the expiry warning message.

**Alert channel warning message is edited in place:**

```
+----------------------------------------------------------+
|  [Green left border]                                     |
|  Session Extended                                        |
|  @Username, your **Moderator** session has been          |
|  extended until in 1 hour.                               |
|  --------------------------------------------------------|
|  [Session Extended] (disabled, grey)                     |
+----------------------------------------------------------+
```

- Title: "Session Extended"
- Colour: Green (`0x57F287`)
- Description: `<@userId>, your **{roleName}** session has been extended until <t:newUnix:R>.`
- Footer timestamp: set to `new Date()`
- Components: disabled "Session Extended" button (Secondary, disabled) — unchanged from current

**Ephemeral reply to user (unchanged):**
```
Your **Moderator** elevation has been extended until <t:newUnix:R>.
```

---

### Flow 4 — Self-Revoke

**Trigger:** User clicks "Revoke Early" on the elevation-granted alert message.

**Alert channel message is edited in place:**
- `components: []` — button removed entirely (no embed body change)
- The original "Role Elevated" green embed remains visible as a historical record

**Audit channel message is edited in place:**

```
+----------------------------------------------------------+
|  [Grey left border]                                      |
|  Session Self-Revoked                                    |
|  @Username's **Moderator** session was ended early by    |
|  the user. Role removed; eligibility intact.             |
+----------------------------------------------------------+
```

- Title: "Session Self-Revoked"
- Colour: Grey (`0x95A5A6`)
- Description: `<@userId>'s **{roleName}** session was ended early by the user. Role removed; eligibility intact.`
- Footer timestamp: set to `new Date()`
- Components: `[]` (admin buttons removed)

Admins can see at a glance that the session ended voluntarily — they should not run
`/watchtower-revoke` since eligibility is intact.

---

### Flow 5 — Admin Revoke

**Trigger:** Admin clicks "Remove Permission" on the elevation-granted audit message.

**Audit channel message is edited in place:**

```
+----------------------------------------------------------+
|  [Red left border]                                       |
|  Permission Removed                                      |
|  @Username's **Moderator** elevation was revoked by      |
|  an administrator.                                       |
+----------------------------------------------------------+
```

- Title: "Permission Removed"
- Colour: Red (`0xED4245`)
- Description: `<@userId>'s **{roleName}** elevation was revoked by an administrator.`
- Footer timestamp: set to `new Date()`
- Components: `[]`

**Alert channel message is edited in place:**
- `components: []` — button removed (original "Role Elevated" embed preserved)

**Ephemeral reply to admin (unchanged):**
```
**Moderator** has been removed from @Username.
```

---

### Flow 6 — Admin Revoke + Block

**Trigger:** Admin clicks "Remove Permission and Block" on the audit message.

**Audit channel message is edited in place:**

```
+----------------------------------------------------------+
|  [Red left border]                                       |
|  Permission Removed and User Blocked                     |
|  @Username's **Moderator** elevation was revoked and     |
|  their PIM account has been blocked by an administrator. |
|  Use /watchtower-unlock to restore their access.         |
+----------------------------------------------------------+
```

- Title: "Permission Removed and User Blocked"
- Colour: Red (`0xED4245`)
- Description: `<@userId>'s **{roleName}** elevation was revoked and their PIM account has been blocked by an administrator. Use \`/watchtower-unlock\` to restore their access.`
- Footer timestamp: set to `new Date()`
- Components: `[]`

**Alert channel message is edited in place:**
- `components: []` — button removed (original embed preserved)

---

### Flow 7 — Natural Expiry

**Trigger:** Cron job detects session has passed `expiresAt`.

**Both channel messages are edited in place:**
- `{ components: [] }` only — embed body is preserved unchanged
- The original elevation-granted embed (green, with user/role/expiry fields) becomes the
  permanent historical record for that session
- No new embed is constructed; no text is changed — the existing embed is enough context

This approach is intentional: the expiry timestamp in the embed already shows the expiry
time. Stripping buttons is sufficient to communicate the session is over.

---

### Flow 8 — Audit Log Default Post (all other events)

**Trigger:** `writeAuditLog` called without `skipChannelPost: true` for events such as
PASSWORD_SET, ACCOUNT_LOCKED, ELIGIBILITY_GRANTED, etc.

**Audit channel:**

```
+----------------------------------------------------------+
|  [Colour by event type]                                  |
|  [emoji] Event Type Label                                |
|  --------------------------------------------------------|
|  User           Role (if present)   When                 |
|  @Username      Moderator           just now             |
+----------------------------------------------------------+
```

- Title: `{emoji} {human-readable event label}`
- Colour: derived from event type (green/orange/red/grey)
- Fields:
  - "User" — `<@userId>`
  - "Role" (only if `roleName` present) — role name
  - "When" — `<t:unix:R>`
- Footer timestamp: set to `new Date()`
- No components

---

## Accessibility

- All embeds use Discord's built-in embed rendering — screen readers used with Discord
  desktop/mobile will announce the embed title and field labels.
- Colour alone does not carry meaning — the embed title (text) always states the event
  type explicitly alongside the colour.
- User mentions `<@userId>` resolve to the user's display name in screen readers.
- No images, attachments, or custom emoji are used (text-only embeds).

---

## Non-Goals

- Ephemeral slash command replies: these are private to the user, not channel posts.
  They remain plain text (no embed) unless a future story changes that.
- DM notifications: out of scope.
- `/watchtower-config` embed: already uses `EmbedBuilder` correctly; no changes needed.
