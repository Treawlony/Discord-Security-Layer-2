# Changelog

All notable changes to Discord Watchtower will be documented in this file.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [Unreleased]

### Added
- `/help` slash command (`src/commands/user/help.ts`): ephemeral embed listing
  all available commands grouped by audience (Admin / User), a PIM concept
  explanation, and a Getting Started sequence for new users.
- Jest test suite (`tests/help-command.test.ts`): 16 unit tests covering
  command metadata, interaction lifecycle, embed content, and absence of
  database usage.
- `jest.config.js`: Jest + ts-jest configuration.
- `npm run test` script in `package.json`.

### Changed
- `CLAUDE.md` — "Adding New Commands" section now includes a reminder to
  update `src/commands/user/help.ts` when a new command is introduced.
