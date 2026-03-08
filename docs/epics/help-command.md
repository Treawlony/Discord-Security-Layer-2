# Epic: /help Slash Command

## Business Value

Discord Watchtower is a Privileged Identity Manager (PIM) bot with a
non-obvious workflow. New users and server admins frequently struggle to
understand what commands exist, which ones apply to them, and what order
to run them in. A `/help` command eliminates this friction with zero
support burden: users self-serve by typing one command instead of
consulting external documentation or asking an admin.

## Success Metrics

- New users can discover and understand the full PIM workflow without
  reading external docs.
- Support questions of the form "how do I use this bot?" drop to zero
  after rollout.
- The command response is accurate: it always reflects the canonical list
  of commands shipped with the bot.

## Scope

### In scope
- A new `/help` slash command placed in `src/commands/user/help.ts`.
- An ephemeral embed response grouping commands into two sections:
  Admin Commands and User Commands.
- A brief PIM concept explanation at the top of the embed so first-time
  users understand why the bot exists.
- A "Getting started" quick-start sequence for regular users.
- No database interaction. No audit log entry (informational, not
  security-relevant).

### Out of scope
- Per-command detail pages or subcommand routing (e.g. `/help elevate`).
- Dynamic introspection of the command registry at runtime.
- Localisation / i18n.
- Admin-only help variant with extra detail.

## Priority

P1 — Low effort, high discoverability value. Unblocks every future user
onboarding. No dependencies on unreleased features.

## Acceptance Criteria (epic level)

1. Running `/help` in any guild produces an ephemeral embed visible only
   to the invoking user.
2. The embed lists all seven existing commands (five admin, two user)
   with a one-line description each.
3. The embed includes a short PIM explanation and a "Getting started"
   sequence for regular users.
4. The command is auto-discovered and registered on bot startup with no
   manual deploy step.
5. The command compiles cleanly with `npm run typecheck` and passes
   `npm run lint`.
6. No database queries are made when the command executes.
