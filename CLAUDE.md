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
    admin/          # Admin-only slash commands (require ManageRoles or Administrator)
      assign.ts     # /watchtower-assign  — grant role eligibility to a user
      revoke.ts     # /watchtower-revoke  — remove eligibility (and active elevation)
      list.ts       # /watchtower-list    — view all assignments
      unlock.ts     # /watchtower-unlock  — unlock a locked-out PIM account
      config.ts     # /watchtower-config  — view/update guild settings
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
    commandLoader.ts  # Auto-discovers and loads all commands
    eventLoader.ts    # Registers Discord event handlers
  jobs/
    expireElevations.ts  # node-cron job — removes expired elevated roles every minute
  index.ts           # Entrypoint
  deploy-commands.ts # One-shot script to register slash commands with Discord API
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

### Guild Configuration (per-server)
Stored in `GuildConfig`. Defaults come from `.env`:
- `sessionDurationMin` (default: 60) — how long elevation lasts
- `lockoutThreshold` (default: 5) — failed attempts before lockout
- `alertChannelId` — channel for elevation alerts
- `auditChannelId` — channel for audit log messages

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

# Register slash commands (development — instant, uses DISCORD_GUILD_ID)
npm run deploy-commands

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

### Setting up the stack in Portainer

1. In Portainer → **Stacks** → **Add stack** → **Repository**
2. Set the repository URL to the GitHub repo
3. Set the compose file path to `docker-compose.yml`
4. Under **Environment variables**, add each variable from the table below
5. Click **Deploy the stack** — Portainer builds the image and starts both services

### Re-deploying after a push

In the Portainer stack UI, click **Pull and redeploy** to pick up new commits. You can also enable **GitOps updates** in Portainer to auto-redeploy on push.

### Local development (Docker)

```bash
# Copy and fill in credentials
cp .env.example .env

# Start both services locally
docker compose up -d

# View bot logs
docker compose logs -f bot

# Tear down (keeps DB volume)
docker compose down

# Tear down and wipe database
docker compose down -v
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
> `DISCORD_GUILD_ID` is only used for local slash command deployment (`npm run deploy-commands`). Do not set it in Portainer.

## Required Bot Permissions

The bot needs the following permissions in Discord:
- **Manage Roles** — to add/remove elevated roles
- **Send Messages** — to post to alert/audit channels
- **Use Slash Commands** — (automatically granted)

**Important**: The bot's role must be positioned _above_ all roles it manages in the server role hierarchy.

## Adding New Commands

1. Create `src/commands/<admin|user>/my-command.ts`
2. Export `data` (a `SlashCommandBuilder`) and `execute(interaction, client)`
3. Run `npm run deploy-commands` to register with Discord

## Coding Conventions

- All user-facing replies must use `ephemeral: true`
- Always `deferReply` at the start of command handlers
- Never store raw passwords — always hash before writing to DB
- Write an `AuditLog` entry for every security-relevant event
- Non-fatal errors (e.g. posting to a Discord channel) should be caught and logged, not thrown
- Use `getOrCreateGuildConfig()` whenever you need guild settings — never hardcode defaults inline
