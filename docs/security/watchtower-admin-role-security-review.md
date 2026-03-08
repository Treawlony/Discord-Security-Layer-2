# Security Review: Watchtower Admin Role

**Feature:** Watchtower Admin Role — Decoupled Bot Management Permissions
**Date:** 2026-03-08
**Reviewer:** Security Engineer
**Result:** PASS — No Critical or High findings. One Medium finding (informational), one Low.

---

## Scope

Files reviewed:
- `src/lib/permissions.ts` (new)
- `src/commands/admin/assign.ts` (modified)
- `src/commands/admin/revoke.ts` (modified)
- `src/commands/admin/list.ts` (modified)
- `src/commands/admin/unlock.ts` (modified)
- `src/commands/admin/config.ts` (modified)
- `src/commands/user/elevate.ts` (modified)
- `prisma/schema.prisma` (modified)
- `prisma/migrations/20260308000000_add_admin_role_id_to_guild_config/migration.sql` (new)

---

## OWASP Top 10 Assessment

### A01 — Broken Access Control

**Finding:** None.

The core objective of this feature is to strengthen access control. The implementation is correct:

- `isWatchtowerAdmin()` is a pure synchronous function — no async gap between check and action where state could change.
- All five admin commands call the guard immediately after `deferReply`, before any business logic. There is no code path that reaches privileged operations without passing through the guard.
- The guard is applied server-side in `execute()` — it cannot be bypassed by Discord client-side manipulation of `setDefaultMemberPermissions`.
- Once `adminRoleId` is set, `Administrator` alone is correctly denied. The two branches are mutually exclusive.
- The `elevate.ts` filter uses `availableRoles.find()` in the collector — meaning a user cannot select an admin role even if they crafted a component interaction directly, because the lookup would return `undefined` and the handler returns early.

**Verified:** The collector in `elevate.ts` uses `availableRoles` (not `pimUser.eligibleRoles`) when looking up the selected role ID. This closes a potential bypass where a user could send a component interaction with the admin role ID — the server-side lookup would fail to find it in the available list.

### A02 — Cryptographic Failures

Not applicable to this feature. No new cryptographic operations introduced.

### A03 — Injection

**Finding:** None.

- `adminRoleId` is stored as a plain string and rendered in embeds as `<@&${id}>` — standard Discord mention syntax, no injection surface.
- The value flows from Discord's API (a validated role object from `interaction.options.getRole()`) directly into a Prisma parameterised query. No SQL interpolation.

### A04 — Insecure Design

**Finding (Medium — Informational):** Lockout risk if admin role is deleted or misconfigured.

If the Discord role designated as `adminRoleId` is deleted from the server, `member.roles.cache.has(deletedId)` returns false for all members. All admin commands become inaccessible. There is no automatic recovery path — the server owner cannot use `Administrator` to fix this because `Administrator` is no longer sufficient once `adminRoleId` is set.

**Assessment:** This is an explicit design decision documented in the epic ("once set, the Watchtower Admin role is the SOLE gate"). The risk is mitigated by:
1. The warning message shown when setting the admin role ("Ensure you hold this role before proceeding.")
2. The `ADMIN_ROLE_CONFIGURED` audit log entry recording who made the change and what role ID was set.
3. The role ID being visible in the config embed at any time (if the bot is still accessible).

**Recommendation:** Document the recovery procedure in the runbook (recreate the role with the exact same Discord snowflake ID, or modify the DB row directly). Severity: Medium / informational — does not represent an attack vector, only an operational risk.

### A05 — Security Misconfiguration

**Finding:** None.

- `setDefaultMemberPermissions(PermissionFlagsBits.Administrator)` is retained on `config.ts` for Discord UI visibility (hides the command from non-admins in the Discord client). The comment in the architecture doc clarifies this is UI-only and not a security gate.
- `setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)` is retained on the other four commands for the same reason.

### A06 — Vulnerable and Outdated Components

Not applicable — no new dependencies introduced.

### A07 — Identification and Authentication Failures

**Finding:** None.

The identity of the invoking user is sourced from `interaction.member` which is provided and signed by the Discord gateway. It cannot be spoofed by a client.

### A08 — Software and Data Integrity Failures

**Finding:** None.

The migration file is checked into source control and applied by Prisma in a transaction. The `adminRoleId` value comes exclusively from Discord's validated role picker — it is a Discord snowflake, not user-supplied free text.

### A09 — Security Logging and Monitoring Failures

**Finding (Low):** `list.ts` has no audit log entry.

`/watchtower-list` is a read-only command. It currently emits no audit log, which is consistent with the pre-existing behaviour. However, a malicious Watchtower Admin could enumerate all PIM assignments without an audit trail.

**Assessment:** Low severity. The command is behind the `isWatchtowerAdmin` guard (so only legitimate admins can call it) and read-only operations are commonly not audited. No action required for this sprint.

### A10 — Server-Side Request Forgery

Not applicable — no outbound HTTP requests introduced.

---

## Additional Security Observations

### Permission Denied Reply — No Role ID Leaked

The denied reply is:
```
You do not have permission to use this command.

A Watchtower Admin role is required. Contact your server owner to be assigned the correct role.
```

The admin role ID (`adminRoleId`) is NOT included in the denial message. This is correct — leaking the role ID would allow an attacker to identify the admin role and potentially target it for social engineering.

### Guard Consistency

All five commands use identical denial logic with no variation. This eliminates the risk of one command having a subtly weaker check.

### Audit Metadata Integrity

The `isWatchtowerAdmin: true` flag in audit log metadata is hardcoded at the call site (after the guard has already passed). It accurately reflects that the action was performed by a verified Watchtower Admin. The flag cannot be false-negatively set because it is only reached after a positive `isWatchtowerAdmin()` result.

---

## Summary

| Severity | Count | Status |
|---|---|---|
| Critical | 0 | — |
| High | 0 | — |
| Medium | 1 | Informational / documented design decision |
| Low | 1 | Accepted / pre-existing pattern |
| Informational | 2 (observations) | Noted, no action required |

**Overall verdict: No blockers. Feature is safe to deploy.**
