# Technical Design: /help Command

## Architecture Overview

The `/help` command is a purely presentational command. It requires no
external dependencies beyond discord.js itself. It slots into the existing
auto-discovery infrastructure with zero changes to any other file.

### Component Diagram

```
Discord Gateway
      |
      | ChatInputCommandInteraction ("help")
      v
interactionCreate.ts
      |
      | commands.get("help")
      v
src/commands/user/help.ts
      |
      | EmbedBuilder (static content)
      v
interaction.editReply({ embeds: [...], ephemeral: true })
      |
      v
Discord Gateway (ephemeral response to user)
```

No database. No external HTTP calls. No guild config lookup.

---

## File Location

```
src/commands/user/help.ts   <-- NEW FILE
```

This location is deliberate:
- `commandLoader.ts` uses `walkDir` to recursively discover all `.ts`/`.js`
  files under `src/commands/`. Placing the file here means it is
  auto-loaded.
- `user/` category is correct: the command is available to all users, not
  restricted by `setDefaultMemberPermissions`.

---

## API Contract

### Slash Command Registration

```
Name:        help
Description: Show all available commands and how Discord Watchtower works.
Options:     none
Permissions: none (visible to all guild members)
```

### Execute Signature

```typescript
export async function execute(
  interaction: ChatInputCommandInteraction,
  _client: Client
): Promise<void>
```

`client` is accepted to match the required signature but is not used.
Named `_client` to satisfy the TypeScript `no-unused-vars` lint rule.

### Response Shape

```
editReply({
  embeds: [EmbedBuilder],
})
```

The embed is constructed entirely from static string literals. No dynamic
fields, no database reads, no async operations after `deferReply`.

---

## Sequence Diagram

```
User          Discord         Bot
 |              |              |
 |--/help------>|              |
 |              |--interaction->|
 |              |              | deferReply({ ephemeral: true })
 |              |<--ack--------|
 |              |              | build EmbedBuilder (synchronous)
 |              |              | editReply({ embeds: [embed] })
 |              |<--edit-------|
 |<--embed------|              |
```

Total async operations: 2 (`deferReply`, `editReply`).
No I/O beyond Discord API calls.

---

## Database Schema Changes

None. No migrations required.

---

## Environment Variable Changes

None.

---

## Security Considerations

- No user input is read or reflected in the response. Zero injection surface.
- No permissions gate needed — help is safe to expose to all guild members.
  (Admin commands are self-contained; viewing their names does not grant
  ability to run them.)
- Response is ephemeral, consistent with all other user-facing commands.
- No secrets, tokens, or configuration values are embedded in the response.

---

## Infrastructure Considerations

- No new infrastructure. The command rides on the existing bot process.
- No new Docker environment variables.
- Global command registration happens automatically in the `ready` handler.
  Discord propagates global commands within ~1 hour of registration.

---

## Dependency Analysis

| Dependency | Used | Version |
|---|---|---|
| discord.js `SlashCommandBuilder` | Yes | v14 (existing) |
| discord.js `ChatInputCommandInteraction` | Yes | v14 (existing) |
| discord.js `Client` | Yes (signature only) | v14 (existing) |
| discord.js `EmbedBuilder` | Yes | v14 (existing) |

No new `npm` packages.

---

## Risks and Mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| Embed content becomes stale when new commands are added | Medium | Add a note to CLAUDE.md "Adding New Commands" section reminding devs to update `help.ts` |
| Discord 4096-char embed description limit exceeded | Low | Current content is well under 1000 chars. Monitor as commands grow. |
| Global command propagation delay (~1 hour) surprises team | Low | Already documented in CLAUDE.md; no change needed |
