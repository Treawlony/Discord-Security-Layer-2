# Feature Gap Analysis — Discord Watchtower v1.1.0
**Date:** 2026-03-10
**Analyst:** BA Review
**Scope:** Functional, data/reporting, and integration gaps identified against the v1.1.0 baseline

---

## Executive Summary

Discord Watchtower v1.1.0 has a solid, security-first PIM core: authentication, session lifecycle, admin controls, and an immutable audit log are all in place. The gaps identified below cluster around three themes:

1. **Admin operational efficiency** — admins cannot do common tasks without running multiple commands or leaving Discord entirely
2. **User experience and transparency** — users lack visibility into their own account state and session history
3. **Guild onboarding and configuration maturity** — the setup experience is manual and error-prone; there is no health-check or guided configuration

The gaps below are ordered within each theme by estimated user impact. No implementation detail is specified; stories are intentionally thin enough for the team to size and design independently.

---

## Theme 1: Admin Operational Efficiency

### GAP-001: No way to see all locked/blocked users at a glance

**Problem:** When a user is locked out or admin-blocked, there is no command to list all affected accounts. Admins must either check `/watchtower-list` (which shows assignments, not lock state) or query the database directly.

**As a** Watchtower Admin
**I want to** run a single command that shows all PIM users who are currently locked out or admin-blocked
**So that** I can triage access issues without querying the database or combing through audit logs

---

### GAP-002: `/watchtower-revoke` requires knowing which role to revoke; no bulk option

**Problem:** `/watchtower-revoke` takes `@user` and `@role` as separate parameters. If an admin wants to remove all eligible roles from a user (e.g., offboarding), they must run the command once per role. The number of roles per user is not surfaced in the command.

**As a** Watchtower Admin
**I want to** revoke all eligible role assignments from a user in a single command invocation
**So that** I can offboard or deprivilege a user quickly without running the command N times

---

### GAP-003: No admin command to forcibly end an active elevation without navigating to the audit channel

**Problem:** The only way to end an active session outside of natural expiry is to find the elevation-granted message in the audit channel and click "Remove Permission". If the audit channel has high volume, finding that specific message is slow. There is no slash command that ends an active elevation by targeting a user.

**As a** Watchtower Admin
**I want to** run `/watchtower-revoke @user` and have it terminate any active elevation for that user immediately, in addition to removing eligibility
**So that** I can act on an incident without hunting for a specific channel message

> **Clarification needed:** Should terminating an active session via command also write `ELEVATION_ADMIN_REVOKED` to the audit log, or a distinct event? This needs a decision before implementation.

---

### GAP-004: No per-role session duration override

**Problem:** `sessionDurationSec` is a single guild-wide setting. An admin cannot configure a shorter session window for highly sensitive roles (e.g., a "Server Manager" role that should only ever be elevated for 15 minutes) versus a less sensitive role that can run for an hour.

**As a** Watchtower Admin
**I want to** optionally set a maximum session duration when assigning a role as eligible
**So that** sensitive roles are automatically constrained to shorter windows regardless of the guild-wide default

---

### GAP-005: Admin-role lockout recovery requires direct DB access

**Problem:** If the Watchtower Admin role is deleted from Discord, recovery requires a direct SQL `UPDATE` on the `guild_configs` table. This is a significant operational risk for non-technical server owners.

**As a** Discord server owner (with the `Administrator` permission)
**I want to** have a recovery path that does not require database access if the Watchtower Admin role is deleted
**So that** I can regain control of the bot without escalating to a developer

> **Flag:** This is a security-sensitive story. The recovery mechanism must not weaken the admin gate during normal operation. Design must be reviewed carefully before implementation.

---

## Theme 2: User Experience and Transparency

### GAP-006: Users cannot check their own account status

**Problem:** A user has no way to know whether their account is locked, blocked, or whether they even have a password set — until they attempt `/elevate` and receive an error. There is no self-service status command.

**As a** PIM user
**I want to** run a command that shows my current PIM account status (password set, locked, blocked, active elevations, eligible roles)
**So that** I understand my account state without having to attempt an elevation and read an error message

---

### GAP-007: Users cannot see their own elevation history

**Problem:** The `/watchtower-audit` command is admin-only. Users have no way to review their own elevation history (when they elevated, which role, how long the session ran). This is a common compliance expectation in PIM systems — users should be able to see their own activity.

**As a** PIM user
**I want to** view my own recent elevation history
**So that** I can verify that no elevations occurred without my knowledge

---

### GAP-008: No feedback when `/elevate` is unavailable due to no eligible roles

**Problem:** If a user has no eligible roles assigned, `/elevate` likely fails silently or with a generic error. The user is not told to contact an admin or given any actionable guidance.

**As a** PIM user who has no eligible roles assigned
**I want to** receive a clear, actionable error message when I run `/elevate`
**So that** I know to contact a Watchtower Admin rather than assuming the bot is broken

> **Note:** This may already be partially handled. Needs verification against the current `/elevate` implementation before writing a full story.

---

### GAP-009: Password change gives no confirmation of what changed or when

**Problem:** `/set-password` confirms success but does not tell the user when their last password was set. Users who share accounts (e.g., service accounts managed by a team) cannot tell if someone changed the password without their knowledge.

**As a** PIM user
**I want to** see the timestamp of my last password change when I run `/set-password`
**So that** I can detect if my password was reset or changed without my knowledge

---

### GAP-010: Session extension has no cap — users can extend indefinitely

**Problem:** The "Extend Session" button resets `expiresAt` to a full new session duration. There is no limit on how many times a user can extend. A user could effectively hold an elevated role indefinitely by extending before each expiry.

**As a** Watchtower Admin
**I want to** configure a maximum number of session extensions per elevation (or a maximum total session wall-clock time)
**So that** users cannot bypass the session duration policy by repeatedly clicking "Extend Session"

---

## Theme 3: Guild Onboarding and Configuration Maturity

### GAP-011: No setup health check command

**Problem:** After inviting the bot, an admin must manually verify that the alert channel, audit channel, and admin role are all correctly configured. There is no command that validates the bot's configuration and surfaces problems (e.g., "alert channel not set", "bot cannot send messages to audit channel", "bot role is below a managed role in the hierarchy").

**As a** Watchtower Admin setting up the bot in a new server
**I want to** run a single command that checks and reports the bot's configuration health
**So that** I can identify and fix configuration problems before users start elevating

---

### GAP-012: No notification when the bot is missing a required Discord permission

**Problem:** If the bot loses the "Manage Roles" permission (e.g., a server admin re-orders roles), session expiry silently fails — the role is not removed and the `ActiveElevation` record remains. There is no alert to admins.

**As a** Watchtower Admin
**I want to** receive a notification in the audit channel when the bot encounters a permission failure
**So that** I can remediate the issue before sessions accumulate or security controls fail silently

---

### GAP-013: `/watchtower-config` shows IDs for channels and roles, not resolved names

**Problem:** The config embed shows raw Discord snowflake IDs (e.g., `alertChannelId: 1234567890`) rather than human-readable names (e.g., `#watchtower-alerts`). Admins have to manually look up IDs to verify the configuration is correct.

**As a** Watchtower Admin
**I want to** see channel and role names (not raw IDs) in the `/watchtower-config` output
**So that** I can confirm configuration is correct at a glance without cross-referencing snowflake IDs

---

### GAP-014: No way to configure different settings per-role at the guild level (e.g., notify-before per role)

**Problem:** `notifyBeforeSec` is guild-wide. A role with a 15-minute session duration would need `notifyBeforeSec` set to a short window globally, which may be wrong for other roles with longer sessions on the same server.

**As a** Watchtower Admin
**I want to** set role-specific notification windows when the guild-wide default is not appropriate
**So that** users receive appropriately timed warnings regardless of how session durations vary across roles

> **Note:** This is related to GAP-004. Both may be addressed together in a single "per-role configuration" story set.

---

## Theme 4: Reporting and Compliance

### GAP-015: `/watchtower-audit` results cannot be filtered by event type

**Problem:** `/watchtower-audit` returns recent events but cannot be filtered by event type (e.g., show only `ELEVATION_GRANTED` events, or only `ACCOUNT_LOCKED` events). Admins investigating a specific incident must scroll through mixed event types.

**As a** Watchtower Admin investigating a security incident
**I want to** filter `/watchtower-audit` results by event type
**So that** I can isolate relevant events without scrolling through unrelated log entries

---

### GAP-016: No date-range filtering on `/watchtower-audit`

**Problem:** `/watchtower-audit` only supports "most recent N events". An admin reviewing what happened during a specific time window (e.g., last 24 hours, or a specific date) cannot do so from Discord.

**As a** Watchtower Admin
**I want to** query the audit log by time range (e.g., last 24 hours, or since a specific date)
**So that** I can produce time-bounded compliance reports without direct database access

---

### GAP-017: No aggregate usage statistics

**Problem:** There is no way to answer questions like "how many elevations happened this week?", "which role is elevated most frequently?", or "which user has the most failed attempts?". These are standard operational metrics for any PIM system.

**As a** Watchtower Admin
**I want to** view a usage summary for the server (elevation counts by role, by user, over a time period)
**So that** I can identify unusual patterns and demonstrate compliance to stakeholders

---

### GAP-018: Audit log has no retention policy or archival mechanism

**Problem:** The `AuditLog` table grows indefinitely. There is no configured retention period, no purge mechanism, and no archival path. In a busy server, this table could grow large enough to affect query performance.

**As a** Watchtower Admin (or bot operator)
**I want to** configure a maximum audit log retention period (e.g., 90 days)
**So that** the database does not grow unbounded and query performance is maintained

> **Flag:** This story has both an admin-facing configuration aspect and a backend job aspect. It should be split into two stories at sprint planning: one for the configuration option, one for the purge job. Data retention policies may also have compliance implications — consult with the server owner before implementing.

---

## Summary Table

| ID | Theme | Title | Estimated Impact | Complexity Signal |
|---|---|---|---|---|
| GAP-001 | Admin Efficiency | List locked/blocked users | High | Low |
| GAP-002 | Admin Efficiency | Bulk eligibility revoke | High | Low |
| GAP-003 | Admin Efficiency | Terminate active session via command | High | Medium |
| GAP-004 | Admin Efficiency | Per-role session duration override | Medium | Medium |
| GAP-005 | Admin Efficiency | Admin-role lockout recovery path | High | High (security-sensitive) |
| GAP-006 | User Experience | User self-status command | High | Low |
| GAP-007 | User Experience | User self-audit history | Medium | Low |
| GAP-008 | User Experience | Actionable error for no eligible roles | Medium | Low |
| GAP-009 | User Experience | Password change timestamp feedback | Low | Low |
| GAP-010 | User Experience | Session extension cap | Medium | Medium |
| GAP-011 | Onboarding | Setup health check command | High | Medium |
| GAP-012 | Onboarding | Bot permission failure notification | High | Medium |
| GAP-013 | Onboarding | Config shows names not IDs | Medium | Low |
| GAP-014 | Onboarding | Per-role notify-before setting | Low | Medium |
| GAP-015 | Reporting | Audit filter by event type | Medium | Low |
| GAP-016 | Reporting | Audit filter by date range | Medium | Low |
| GAP-017 | Reporting | Aggregate usage statistics | Low | Medium |
| GAP-018 | Reporting | Audit log retention policy | Low | High |

---

## Recommended Sprint 1 Candidates

Based on impact-to-complexity ratio, the following gaps are strong candidates for the next sprint:

- **GAP-001** — Low complexity, high admin value, no schema change likely needed
- **GAP-006** — Low complexity, high user value, pure read path
- **GAP-002** — Low complexity, removes a painful multi-command workflow
- **GAP-013** — Low complexity, improves daily admin usability immediately
- **GAP-008** — Low complexity, removes a confusing silent failure

The following gaps should be **discussed and scoped** before committing, as they carry cross-cutting design decisions:

- **GAP-003** — Needs a decision on whether `/watchtower-revoke @user` (without a role) should also terminate the active elevation, or whether a separate command is introduced
- **GAP-005** — Security-sensitive; needs design review before any implementation begins
- **GAP-010** — Needs a policy decision on what "max extensions" means (count-based vs. wall-clock cap)
