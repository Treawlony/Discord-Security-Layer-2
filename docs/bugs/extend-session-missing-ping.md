# Bug Report: "Extend Session" Message Edit Drops User Ping

**ID:** BUG-007
**Severity:** Medium
**Component:** `src/lib/buttonHandlers.ts` — `handleExtendSession`
**Reported:** 2026-03-09
**Branch:** develop

---

## Summary

When a user clicks the "Extend Session" button in the alert channel, the bot edits
the expiry-warning message to show a "Session Extended" embed. Before the EPIC-006
embed rework this message edit included `content: \`<@${userId}>\`` so the user
received a Discord ping notification. The rework replaced the plain-text message
with an embed but set `content: ""`, silently dropping the ping.

The embed description contains `<@userId>` as a visual mention, but Discord only
fires a notification ping when the mention appears in the `content` field — not
inside an embed.

---

## Steps to Reproduce

1. Have an active elevation with `notifyBeforeSec` configured.
2. Wait for the cron job to post the expiry warning in the alert channel.
3. Click the "Extend Session" button on the warning message.
4. Observe: the bot edits the message to show "Session Extended" but the user
   receives no notification ping.

## Expected Behaviour

The user receives a Discord mention notification (ping) when their session is
successfully extended, so they know the action was acknowledged.

## Actual Behaviour

`content` is set to `""` on the edited message. No ping is sent to the user.

---

## Root Cause

In `handleExtendSession` (line 94–98 of `buttonHandlers.ts`), the `message.edit`
call was updated during EPIC-006 to pass `content: ""` alongside the new embed.
The prior plain-text implementation carried the `<@userId>` mention in `content`.
That was not ported across.

```typescript
// Current (broken)
await interaction.message.edit({
  embeds: [buildExtendedSessionEmbed(...)],
  content: "",          // <-- ping was here before the embed rework
  components: [row],
});
```

---

## Fix

Set `content` to the user mention string rather than an empty string on that
single `message.edit` call:

```typescript
content: `<@${elevation.pimUser.discordUserId}>`,
```

This change must be scoped only to `handleExtendSession`. All other handlers
(self-revoke, admin-revoke, admin-revoke-block) must keep `content: ""` — they
post to the audit channel where pings are neither expected nor appropriate.

---

## Scope

- **File changed:** `src/lib/buttonHandlers.ts` (1-line change)
- **Tests to update:** `tests/embed-notifications.test.ts`
  - The existing assertion `expect(fn).toContain('content: ""')` inside
    `handleExtendSession edits warning message with buildExtendedSessionEmbed`
    must be updated to assert the ping is present.
  - A new explicit regression test must be added confirming the `content` field
    contains the user mention.
  - Section 8 ("No-ping guarantee") tests that cover the expiry-warning alert
    *send* (not the "Extend Session" *edit*) must remain unchanged.

---

## Acceptance Criteria

- [ ] `handleExtendSession` message edit includes `content: \`<@${userId}>\`` where
      `userId` is `elevation.pimUser.discordUserId`.
- [ ] All other `message.edit` / `channel.send` calls outside `handleExtendSession`
      keep `content: ""` or no `content` field.
- [ ] Regression test asserts the ping `content` is present in `handleExtendSession`.
- [ ] All existing 87 embed-notification tests continue to pass.
- [ ] Full test suite (278 tests) remains green.
