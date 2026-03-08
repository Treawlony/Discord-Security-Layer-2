# Discord Watchtower — CLAUDE.md

## Project Overview

Discord Watchtower is a **Privileged Identity Manager (PIM)** Discord bot. Rather than assigning powerful roles permanently, admins designate which roles each user is _eligible_ for. Users set their own password, then invoke `/elevate`, authenticate, and pick from a dropdown of eligible roles. The role is granted for a configurable duration and then automatically removed.

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 20 (LTS) |
| Language | TypeScript 5 |
| Discord library | discord.js v14 |
| ORM | Prisma v5 |
| Database | PostgreSQL 16 |
| Containers | Docker + Docker Compose |
| Password hashing | bcrypt (12 rounds) |
| Scheduling | node-cron |
| Validation | Zod |

## Project Structure

```
src/
  commands/
    admin/          # Admin-only slash commands (runtime-gated by isWatchtowerAdmin())
      assign.ts     # /watchtower-assign  — grant role eligibility to a user
      revoke.ts     # /watchtower-revoke  — remove eligibility (and active elevation)
      list.ts       # /watchtower-list    — view all assignments
      unlock.ts     # /watchtower-unlock  — unlock a locked-out PIM account
      config.ts     # /watchtower-config  — view/update guild settings (incl. admin role)
    user/           # User-facing slash commands
      set-password.ts  # /set-password   — register or change PIM password
      elevate.ts       # /elevate        — authenticate + select role to elevate
  events/
    ready.ts             # Bot ready handler
    interactionCreate.ts # Routes interactions to command handlers
  lib/
    database.ts    # Prisma singleton
    crypto.ts      # bcrypt helpers + Zod password schema
    audit.ts       # Write audit log to DB and Discord channel
    guildConfig.ts # Upsert guild config with defaults
    permissions.ts # isWatchtowerAdmin() — runtime admin permission check
    commandLoader.ts  # Auto-discovers and loads all commands
    eventLoader.ts    # Registers Discord event handlers
  jobs/
    expireElevations.ts  # node-cron job — removes expired elevated roles every minute
  index.ts           # Entrypoint
prisma/
  schema.prisma  # All DB models (GuildConfig, PimUser, EligibleRole, ActiveElevation, AuditLog)
```

## Key Concepts

### PIM Flow
1. Admin runs `/watchtower-assign @user @role` (user must have run `/set-password` first)
2. User runs `/elevate`, enters their password
3. Bot verifies password, resets failed-attempt counter on success
4. Bot presents a string-select menu with the user's eligible roles
5. User selects a role → role is assigned in Discord + `ActiveElevation` record created
6. The expiry cron job checks every minute for expired sessions and removes the role

### Security Controls
- **Password hashing**: bcrypt with 12 salt rounds; passwords never stored in plaintext
- **Complexity rules** (enforced by Zod at `/set-password`): min 8 chars, uppercase, lowercase, number, special char
- **Lockout**: configurable N failed attempts → `lockedAt` set → admin must run `/watchtower-unlock`
- **Ephemeral replies**: all sensitive interactions use `ephemeral: true`
- **Audit log**: every event written to `audit_logs` table + optionally posted to a Discord channel
- **Watchtower Admin role**: bot management is gated by `isWatchtowerAdmin()` at runtime in every admin command. `setDefaultMemberPermissions` on the SlashCommandBuilder is UI-only and is NOT the security gate. See `src/lib/permissions.ts`.

### Guild Configuration (per-server)
Stored in `GuildConfig`. Defaults come from `.env`:
- `sessionDurationMin` (default: 60) — how long elevation lasts
- `lockoutThreshold` (default: 5) — failed attempts before lockout
- `alertChannelId` — channel for elevation alerts
- `auditChannelId` — channel for audit log messages
- `adminRoleId` (default: null) — Discord role ID of the Watchtower Admin role. When null, bot management falls back to Discord `Administrator` permission (bootstrap mode). Once set, this role is the **sole** gate — `Administrator` alone is denied.

### Watchtower Admin Role — Bootstrap Behaviour
- **Not configured** (`adminRoleId = null`): any user with Discord `Administrator` can run admin commands.
- **Configured** (`adminRoleId` set): only users holding that Discord role can run admin commands. `Administrator` is no longer sufficient.
- Set the admin role via `/watchtower-config admin-role:@role`.
- **New guild setup**: after inviting the bot, a Discord Administrator must run `/watchtower-config admin-role:@role` to register the Watchtower Admin role. Until then the bot is in bootstrap mode (Administrator-only).
- **Recovery if locked out**: if the admin role is deleted from Discord, you must edit the `guild_configs` table directly (`UPDATE guild_configs SET admin_role_id = NULL WHERE guild_id = '...'`) to re-enter bootstrap mode.

## Database Schema Summary

```
GuildConfig       — per-guild settings
PimUser           — registered users (hashed password, lockout state)
EligibleRole      — which roles a PimUser may elevate to
ActiveElevation   — in-progress elevation sessions with expiry timestamps
AuditLog          — immutable event log (AuditEventType enum)
```

## Common Commands

```bash
# Install dependencies
npm install

# Generate Prisma client
npm run db:generate

# Run DB migrations (production)
npm run db:migrate

# Run DB migrations (development, creates migration files)
npm run db:migrate:dev

# Start in development mode (auto-restart on change)
npm run dev

# Build TypeScript
npm run build

# Start production build
npm start

# Type-check without emitting
npm run typecheck

# Lint
npm run lint
```

## Deployment — GitHub + Portainer

The project is deployed via **Portainer GitOps**: Portainer pulls `docker-compose.yml` directly from the GitHub repo and builds/runs the stack. No `.env` file is used in production — all variables are set in the Portainer stack UI.

### Local development (Docker)

```bash
cp .env.example .env && docker compose up -d   # start services
docker compose logs -f bot                      # view bot logs
docker compose down                             # tear down (add -v to wipe DB)
```

## Environment Variables

All variables must be set in **Portainer → Stack → Environment variables** for production. For local development, copy `.env.example` to `.env`.

| Variable | Required | Description |
|---|---|---|
| `DISCORD_TOKEN` | Yes | Bot token from Discord Developer Portal |
| `DISCORD_CLIENT_ID` | Yes | Application ID |
| `POSTGRES_USER` | Yes | PostgreSQL username |
| `POSTGRES_PASSWORD` | Yes | PostgreSQL password |
| `POSTGRES_DB` | Yes | PostgreSQL database name |
| `DEFAULT_SESSION_DURATION_MIN` | No | Elevation session length in minutes (default: 60) |
| `DEFAULT_LOCKOUT_THRESHOLD` | No | Failed attempts before lockout (default: 5) |

> `DATABASE_URL` is constructed automatically from the Postgres vars — do **not** set it separately in Portainer.
>
## Required Bot Permissions

Required Discord permissions: **Manage Roles** (add/remove elevated roles), **Send Messages** (alert/audit channels), **Use Slash Commands**. The bot's role must be positioned _above_ all roles it manages in the server role hierarchy.

## Adding New Commands

1. Create `src/commands/<admin|user>/my-command.ts`
2. Export `data` (a `SlashCommandBuilder`) and `execute(interaction, client)`
3. Restart the bot — commands are registered globally with Discord automatically in the `ready` event; no manual deploy step is needed. Global propagation takes up to 1 hour.
4. **Update `src/commands/user/help.ts`** — the help embed is static and must be manually updated to include the new command name and description in the appropriate section (Admin Commands or User Commands).

## Coding Conventions

- All user-facing replies must use `flags: MessageFlags.Ephemeral` (import `MessageFlags` from `discord.js`). The `ephemeral: true` option is deprecated in discord.js v14+ and must not be used.
- `interaction.reply()` and `interaction.followUp()` require `flags: MessageFlags.Ephemeral as number` (explicit cast). `deferReply()` accepts `MessageFlags.Ephemeral` without a cast. Do not remove the `as number` cast from `reply()`/`followUp()` calls.
- Always `deferReply` at the start of command handlers
- Never store raw passwords — always hash before writing to DB
- Write an `AuditLog` entry for every security-relevant event
- Non-fatal errors (e.g. posting to a Discord channel) should be caught and logged, not thrown
- Use `getOrCreateGuildConfig()` whenever you need guild settings — never hardcode defaults inline
- All admin commands MUST call `isWatchtowerAdmin(member, config)` immediately after `deferReply`. The `member` is `interaction.member as GuildMember`. The `config` comes from `getOrCreateGuildConfig()`. Include `isWatchtowerAdmin: true` in audit log metadata for all admin-originated events.
- `setDefaultMemberPermissions` on the SlashCommandBuilder is for Discord UI visibility only — it is NOT a security control. Never rely on it as the sole gate.
- Admin commands intentionally have **no** `setDefaultMemberPermissions` call — they are visible to all users in the Discord UI. `isWatchtowerAdmin()` is the sole gate and returns a user-facing error to unauthorized callers. Do not add `setDefaultMemberPermissions` back to admin commands.

## Database Migration Conventions

- All column names in migration SQL must be **camelCase** (e.g., `"guildId"`, `"alertChannelId"`, `"adminRoleId"`). The project's init migration established this pattern. Using snake_case causes Prisma P2022 "column not found" errors at runtime.
- Never write raw snake_case column names in `.sql` migration files.
- `prisma` CLI must remain in `dependencies` (not `devDependencies`). The Docker runner stage runs `npm ci --omit=dev`; if `prisma` is a devDep it is dropped and `prisma migrate deploy` in the container startup CMD silently skips, leaving the DB schema behind the code.

## Versioning

- **PATCH** (`x.x.N`): bug fixes with no schema or API changes
- **MINOR** (`x.N.0`): new features, new commands, new DB fields, new config options
- **MAJOR** (`N.0.0`): breaking changes (schema incompatible with previous version, env var renames, etc.)
- Tag every release: `git tag vX.Y.Z && git push origin vX.Y.Z`
- Update `CHANGELOG.md` before tagging
