# User Stories: /help Command

## Story Map

Current state: Users must consult CLAUDE.md, ask an admin, or reverse-engineer
the bot to understand the available commands and workflow.

Future state: Any user can type `/help` and receive a structured, self-contained
reference for all commands and the PIM workflow.

---

## US-01: Regular user discovers available commands

**As a** regular Discord server member,
**I want to** run `/help` and see a list of all commands I can use,
**So that** I know how to set up my PIM account and request role elevation.

### Acceptance Criteria

- AC-01.1: The reply is ephemeral (visible only to me).
- AC-01.2: The embed contains a "User Commands" section listing:
  - `/set-password` — with usage note: run this first before anything else.
  - `/elevate` — with usage note: enter your PIM password to request a role.
  - `/help` — with usage note: show this help message.
- AC-01.3: The embed contains a "Getting Started" section with a numbered
  sequence: (1) run `/set-password`, (2) ask an admin to assign roles,
  (3) run `/elevate`.
- AC-01.4: A brief PIM concept explanation appears at the top of the embed.
- AC-01.5: The response arrives within 3 seconds of invoking the command.

---

## US-02: Admin discovers available admin commands

**As a** server administrator,
**I want to** run `/help` and see a list of all admin commands,
**So that** I can onboard users without consulting external documentation.

### Acceptance Criteria

- AC-02.1: The embed contains an "Admin Commands" section listing:
  - `/watchtower-assign` — with note: requires Manage Roles permission.
  - `/watchtower-revoke` — with note: removes eligibility and ends any active session.
  - `/watchtower-list` — with note: shows all PIM assignments in this server.
  - `/watchtower-unlock` — with note: clears account lockout after too many failed attempts.
  - `/watchtower-config` — with note: view or change session duration, lockout threshold,
    alert channel, and audit channel.
- AC-02.2: Admin commands are clearly labelled as requiring elevated permissions.
- AC-02.3: The admin and user sections are visually separated (different embed fields
  or a clear header line).

---

## US-03: Command is available guild-wide without configuration

**As a** server admin who just added the bot,
**I want** `/help` to be available immediately after the bot starts,
**So that** I do not need to run any registration step manually.

### Acceptance Criteria

- AC-03.1: The command file placed at `src/commands/user/help.ts` is picked up by
  the existing `commandLoader.ts` auto-discovery mechanism.
- AC-03.2: The command is registered globally via the `ready` event handler with no
  code changes to any other file.
- AC-03.3: No database migrations are required.
- AC-03.4: No new environment variables are required.

---

## Process Flow

### Current State
User wants to know how the bot works
  -> Asks admin
    -> Admin may not know either
      -> Confusion / wasted time

### Future State
User wants to know how the bot works
  -> Types /help
    -> Receives ephemeral embed with PIM explanation, command list,
       and getting-started steps
      -> User self-serves successfully

---

## Data Requirements

- No data read from or written to the database.
- All content is static, hardcoded in the command file.
- No guild configuration is needed (no call to `getOrCreateGuildConfig`).

---

## Edge Cases

| Scenario | Expected Behaviour |
|---|---|
| User runs `/help` in a DM with the bot | Discord rejects the command at the gateway level — guild-only commands return an error automatically. No special handling needed since all existing commands are guild-only by convention. |
| Bot lacks Send Messages permission | `deferReply` will fail; the error handler in `interactionCreate.ts` catches it and logs. No special handling needed in the command itself. |
| Command is invoked while bot is mid-restart | Discord queues the interaction; the bot responds once ready. Standard behaviour. |
| Two users run `/help` simultaneously | Each receives their own ephemeral reply. No shared state. |
