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
      unlock.ts     # /watchtower-unlock  — unlock a locked-out or admin-blocked PIM account
      config.ts     # /watchtower-config  — view/update guild settings (incl. admin role, notify-before)
    user/           # User-facing slash commands
      set-password.ts  # /set-password   — register or change PIM password
      elevate.ts       # /elevate        — authenticate + select role to elevate
  events/
    ready.ts             # Bot ready handler
    interactionCreate.ts # Routes slash commands AND button interactions
  lib/
    database.ts       # Prisma singleton
    crypto.ts         # bcrypt helpers + Zod password schema
    audit.ts          # Write audit log to DB and Discord channel (see skipChannelPost)
    guildConfig.ts    # Upsert guild config with defaults
    permissions.ts    # isWatchtowerAdmin() — runtime admin permission check
    buttonHandlers.ts # Button interaction handlers (extend_session, remove_perm, remove_perm_block)
    commandLoader.ts  # Auto-discovers and loads all commands
    eventLoader.ts    # Registers Discord event handlers
  jobs/
    expireElevations.ts  # node-cron job — warning scan + expiry scan, runs every minute
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
5. User selects a role → role is assigned in Discord + `ActiveElevation` record created + interactive message posted to audit channel with "Remove Permission" / "Remove Permission and Block" buttons
6. The cron job runs every minute:
   - **Warning scan**: finds sessions within `notifyBeforeMin` of expiry with `notifiedAt IS NULL`, posts a warning to the audit channel with an "Extend Session" button, sets `notifiedAt`
   - **Expiry scan**: finds sessions past `expiresAt`, removes the Discord role, deletes the record

### Security Controls
- **Password hashing**: bcrypt with 12 salt rounds; passwords never stored in plaintext
- **Complexity rules** (enforced by Zod at `/set-password`): min 8 chars, uppercase, lowercase, number, special char
- **Lockout**: configurable N failed attempts → `lockedAt` set → admin must run `/watchtower-unlock`
- **Admin block**: admin can click "Remove Permission and Block" in audit channel → `blockedAt` set on `PimUser` → user cannot elevate until admin runs `/watchtower-unlock`
- **Ephemeral replies**: all sensitive interactions use `flags: MessageFlags.Ephemeral`
- **Audit log**: every event written to `audit_logs` table + optionally posted to a Discord channel
- **Watchtower Admin role**: bot management is gated by `isWatchtowerAdmin()` at runtime in every admin command. `setDefaultMemberPermissions` on the SlashCommandBuilder is UI-only and is NOT the security gate. See `src/lib/permissions.ts`.
- **Button auth**: button handlers always re-fetch the elevation record from DB and re-validate auth server-side on every click. Never trust the `customId` alone.

### Guild Configuration (per-server)
Stored in `GuildConfig`. Defaults come from `.env`:
- `sessionDurationMin` (default: 60) — how long elevation lasts
- `lockoutThreshold` (default: 5) — failed attempts before lockout
- `notifyBeforeMin` (default: 5) — minutes before expiry to post warning; `0` disables notifications
- `alertChannelId` — fallback channel for plain-text elevation alerts (used when `auditChannelId` is not set)
- `auditChannelId` — primary channel for audit log messages and interactive button messages (warnings, elevation grants)
- `adminRoleId` (default: null) — Discord role ID of the Watchtower Admin role. When null, bot management falls back to Discord `Administrator` permission (bootstrap mode). Once set, this role is the **sole** gate — `Administrator` alone is denied.

### Watchtower Admin Role — Bootstrap Behaviour
- **Not configured** (`adminRoleId = null`): any user with Discord `Administrator` can run admin commands.
- **Configured** (`adminRoleId` set): only users holding that Discord role can run admin commands. `Administrator` is no longer sufficient.
- Set the admin role via `/watchtower-config admin-role:@role`.
- **New guild setup**: after inviting the bot, a Discord Administrator must run `/watchtower-config admin-role:@role` to register the Watchtower Admin role. Until then the bot is in bootstrap mode (Administrator-only).
- **Recovery if locked out**: if the admin role is deleted from Discord, you must edit the `guild_configs` table directly (`UPDATE guild_configs SET admin_role_id = NULL WHERE guild_id = '...'`) to re-enter bootstrap mode.

## Database Schema Summary

```
GuildConfig       — per-guild settings (incl. notifyBeforeMin)
PimUser           — registered users (hashed password, lockout state, blockedAt)
EligibleRole      — which roles a PimUser may elevate to
ActiveElevation   — in-progress elevation sessions with expiry timestamps (incl. notifiedAt)
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

## Multi-Guild Requirements

The bot is designed to run in multiple Discord servers simultaneously. Every feature must maintain full guild isolation:

- **All DB queries must be scoped by `guildId`** — never fetch records across guilds. Use `interaction.guildId` as the scope for slash commands; use the explicit `guildId` parameter for background jobs.
- **Button handlers must validate `interaction.guildId === elevation.guildId`** (or equivalent record field) before processing. Without this check, a crafted interaction from Guild B could act on Guild A's data.
- **Background jobs (cron)** have no guild context — they must iterate all guilds and process each independently, never mixing data from different guilds.
- **New DB models** must include a `guildId` field and be queried with it. New unique constraints must include `guildId` where applicable (e.g. `@@unique([discordUserId, guildId])`).
- **No hardcoded guild IDs** anywhere in the codebase.

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

### Button Interaction Conventions

- Button handlers live in `src/lib/buttonHandlers.ts`. Each handler is an exported `async function(interaction: ButtonInteraction, client: Client): Promise<void>`.
- Button handlers MUST `deferReply({ flags: MessageFlags.Ephemeral })` as their first statement — Discord requires acknowledgement within 3 seconds.
- Button `customId` format: `<action>:<recordId>`. The record ID is parsed with `.slice("<action>:".length)`.
- Always re-fetch the DB record inside the handler and guard against not-found (the record may have been deleted by the expiry scan between message post and button click). Never rely on data embedded in the `customId`.
- Auth checks in button handlers: "Extend Session" checks `interaction.user.id === elevation.pimUser.discordUserId`; "Remove Permission" and "Remove Permission and Block" call `isWatchtowerAdmin(interaction.member as GuildMember, config)`.
- After performing the action, update the original message's components to disabled buttons (wrapped in try/catch — non-fatal if the message was deleted).
- Button routing in `interactionCreate.ts` uses `customId.startsWith("<prefix>")`. When two prefixes share a common start (e.g. `remove_perm:` and `remove_perm_block:`), the **longer/more-specific prefix must be checked first**.

### Alert channel vs Audit channel

- `alertChannelId` is **user-facing**: receives the elevation-granted ping and the expiry warning with the **Extend Session** button. Do not post admin-only content here.
- `auditChannelId` is **admin-facing**: receives the elevation-granted message with **Remove Permission** / **Remove Permission and Block** buttons, plain-text expiry warnings, and all other audit log events.
- Both channels post independently — if both are configured, each receives its respective content. If only one is configured, that channel receives both sets of posts.
- Any future feature that posts to a channel must follow this split.

### `writeAuditLog` — `skipChannelPost`

- `writeAuditLog` always posts a plain-text echo to the audit channel by default.
- When your code has already posted its own interactive message (with buttons) to the audit channel for the same event, pass `skipChannelPost: true` to suppress the duplicate echo.
- Current callers using `skipChannelPost: true`: `elevate.ts` for `ELEVATION_GRANTED`, `expireElevations.ts` for `ELEVATION_EXPIRY_WARNING`.

### `PimUser` — `lockedAt` vs `blockedAt`

- `lockedAt`: set automatically after N failed password attempts (`ACCOUNT_LOCKED`). Cleared by `/watchtower-unlock`.
- `blockedAt`: set explicitly by an admin via the "Remove Permission and Block" button (`ELEVATION_BLOCKED`). Cleared by `/watchtower-unlock`.
- Both are checked in `/elevate` before proceeding (lockout check first, block check second).
- Both are cleared by `/watchtower-unlock` in a single `pimUser.update` call.

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
