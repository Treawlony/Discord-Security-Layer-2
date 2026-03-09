# Security Review: Discord Embed Notification System (EPIC-006)

**Reviewer:** security-engineer
**Date:** 2026-03-09
**Scope:** All new and modified files in the embed-notification refactor

---

## Files Reviewed

- `src/lib/embeds.ts` (new)
- `src/lib/audit.ts` (modified)
- `src/commands/user/elevate.ts` (modified)
- `src/jobs/expireElevations.ts` (modified)
- `src/lib/buttonHandlers.ts` (modified)

---

## OWASP Top 10 Assessment

### A01 — Broken Access Control
**Finding:** No change.
All authorization logic is unchanged. `isWatchtowerAdmin` is still called at the top of
every admin-gated button handler (`handleRemovePerm`, `handleRemovePermBlock`). User
identity checks (`interaction.user.id === elevation.pimUser.discordUserId`) in
`handleExtendSession` and `handleSelfRevoke` are unchanged. Guild isolation guards
(`interaction.guildId !== elevation.guildId`) in all handlers are unchanged.
**Status: PASS**

### A02 — Cryptographic Failures
**Finding:** Not applicable.
No passwords, secrets, or tokens are handled in the modified files. bcrypt hashing in
`crypto.ts` is untouched. `embeds.ts` is a pure presentation module with no secret data.
**Status: N/A**

### A03 — Injection
**Finding:** Reviewed.
All embed field values come from:
1. `discordUserId` — stored in DB, format-validated by Discord itself on ingestion.
2. `roleName` — stored in DB, sourced from Discord API guild role objects (server admin-
   controlled, not user-input at embed construction time).
3. `eventType` — typed as `AuditEventType` enum; cannot be arbitrary string.
4. Timestamps — computed from `Date` objects.

None of these values are user-controlled freeform input at the point of embed
construction. Discord's own API enforces embed field length limits. No injection risk.
**Status: PASS**

### A04 — Insecure Design
**Finding:** No regression.
The ping-suppression design is architecturally correct: `<@userId>` inside embed
`description`/`fields` does not trigger a Discord notification ping. The `content`
field of all channel sends is explicitly absent (or set to `""` on edits), enforcing
the no-ping guarantee. This is a deliberate, documented design decision, not a bypass.
**Status: PASS**

### A05 — Security Misconfiguration
**Finding:** No change.
No new environment variables, no new Discord permission requirements, no configuration
surface added. The bot's existing permission set (Manage Roles, Send Messages) covers
embed sends — Discord does not require extra permissions to send embeds.
**Status: PASS**

### A06 — Vulnerable and Outdated Components
**Finding:** Not applicable.
No new dependencies introduced. `EmbedBuilder` is a native discord.js v14 class already
present in the dependency tree and already used in `config.ts`.
**Status: N/A**

### A07 — Identification and Authentication Failures
**Finding:** No change.
All authentication and session validation is unchanged. `deferReply` with
`MessageFlags.Ephemeral` is still the first statement in every button handler. The
`fetchReply` + `awaitMessageComponent` pattern in `elevate.ts` is unchanged.
**Status: PASS**

### A08 — Software and Data Integrity Failures
**Finding:** No change.
Button `customId` values (`remove_perm:`, `remove_perm_block:`, `extend_session:`,
`self_revoke:`) are unchanged. The `interactionCreate.ts` routing order (more-specific
`remove_perm_block:` checked before `remove_perm:`) is unchanged. DB records are
re-fetched server-side on every button click — no trust in client-supplied state.
**Status: PASS**

### A09 — Security Logging and Monitoring Failures
**Finding:** No regression.
`writeAuditLog` still writes to the DB for every security event regardless of
`skipChannelPost`. The DB audit record is the authoritative log; the channel post is
optional decoration. This separation is unchanged.
**Status: PASS**

### A10 — Server-Side Request Forgery (SSRF)
**Finding:** Not applicable.
No HTTP requests are made in the modified code. Discord.js API calls use the configured
bot token via websocket/HTTPS — no user-controlled URLs are introduced.
**Status: N/A**

---

## Embed-Specific Security Checks

### Ping Suppression Correctness
Discord embeds do not trigger notification pings for `<@userId>` mentions. This is
confirmed Discord API behaviour (documented in the Discord Developer Portal). The
`content` property is absent from all `channel.send()` calls in the modified files —
verified in code review and tested in `tests/embed-notifications.test.ts` (Section 8,
"No-ping guarantee" tests).

### Content Clearing on Edits
The `.edit()` calls that replace a plain-text message with an embed (in
`buttonHandlers.ts`) now explicitly set `content: ""`. Without this, the old `v1.0.0`
plain-text `content` field would persist alongside the new embed — which would be
harmless (no mention) but visually incorrect. The explicit clear is a defensive
improvement.

### Data Exposure
Embed fields show:
- User IDs rendered as `<@userId>` — these are the same Discord user IDs already visible
  to anyone with channel access. No new data exposure.
- Role names — same as before. Discord role names are not sensitive.
- Timestamps — session expiry times are shown in the existing alert channel; no new
  information disclosed.

---

## Findings Summary

| Severity | Count | Items |
|---|---|---|
| Critical | 0 | — |
| High | 0 | — |
| Medium | 0 | — |
| Low | 0 | — |
| Informational | 1 | `content: ""` on edits is a defensive improvement over omitting it |

**Overall verdict: APPROVED — no security concerns introduced.**
