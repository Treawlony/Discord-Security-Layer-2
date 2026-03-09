# Epic: Discord Embed Notification System

## Epic ID
EPIC-006

## Title
Rework all channel-posted messages to use Discord embeds instead of plain text

## Business Value

Discord's embed system renders `<@userId>` mentions as clickable, formatted user links
without triggering a notification ping. Plain-text messages with `<@userId>` ping the
user every time, causing notification noise for security-related events the user may not
need to act on immediately.

By converting all channel posts to embeds:
- User IDs become readable, clickable mentions (better UX) with zero ping noise
- Messages gain consistent visual structure (title, colour, fields, timestamp)
- Admins can scan the audit channel more quickly — structured fields are easier to parse
  than run-on plain-text strings
- Alert-channel messages remain clearly distinguishable from audit-channel messages by
  embed colour alone

## Problem Statement

After a recent change that removed `<@userId>` mentions from plain-text channel posts
(to suppress notification pings), user IDs are now displayed as bare backtick strings
(e.g. `` `123456789` ``). This is less readable and prevents admins/users from
clicking through to a user profile. The root cause is that plain-text messages DO trigger
pings; embeds do NOT. Converting to embeds lets us restore `<@userId>` mentions
everywhere for readability without the ping side-effect.

## Success Metrics

1. All channel-posted messages (audit log, alert channel, elevation-granted, expiry
   warning, self-revoke audit edit, admin-revoke audit edit) render as Discord embeds.
2. No user receives an unwanted notification ping from any embed mention.
3. All existing automated tests continue to pass (278 currently passing).
4. New tests cover embed field presence and mention format.
5. No regression in button interactivity (buttons still attach to the embed message).

## Scope

### In Scope
- `src/lib/audit.ts` — `writeAuditLog()` default channel post → embed
- `src/commands/user/elevate.ts` — elevation-granted messages to audit + alert channels
- `src/jobs/expireElevations.ts` — expiry warning (alert + audit) and expiry cleanup
  edits to both channel messages
- `src/lib/buttonHandlers.ts` — self-revoke audit edit, admin-revoke audit edit,
  extend-session button message edit (on the warning message)
- A new shared embed-builder utility (`src/lib/embeds.ts`) to keep embed construction
  DRY across all callers

### Out of Scope
- Ephemeral slash command replies (these are user-only, already correct, no change needed)
- Database schema changes (no new fields required)
- Any new commands or bot features
- Push to master (staging validation first)

## Priority
High — directly impacts usability and reduces notification noise for every active guild.

## Dependencies
- No schema migration required
- discord.js v14 `EmbedBuilder` is already available in the dependency tree

## Risks
- Existing source-level tests (`expiry-notifications.test.ts`, others) use string matching
  against file contents. New embed strings must be checked and tests updated accordingly.
- The expiry scan edits existing messages (which were originally posted as plain-text +
  buttons). After this change, those messages will be embeds; the edit call must also
  supply the updated embed, not just `components: []`.

## Version Impact
MINOR — new feature with no schema or API breaking changes. Next version: `v1.1.0`.
