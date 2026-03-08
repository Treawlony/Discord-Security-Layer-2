# Code Review: Watchtower Admin Role

**Feature:** Watchtower Admin Role — Decoupled Bot Management Permissions
**Date:** 2026-03-08
**Reviewer:** Code Reviewer
**Result:** PASS — 0 Must Fix, 0 Should Fix, 2 Consider items (informational)

---

## Files Reviewed

| File | Change Type | Status |
|---|---|---|
| `prisma/schema.prisma` | Modified | Approved |
| `prisma/migrations/20260308000000_.../migration.sql` | New | Approved |
| `src/lib/permissions.ts` | New | Approved |
| `src/commands/admin/assign.ts` | Modified | Approved |
| `src/commands/admin/revoke.ts` | Modified | Approved |
| `src/commands/admin/list.ts` | Modified | Approved |
| `src/commands/admin/unlock.ts` | Modified | Approved |
| `src/commands/admin/config.ts` | Modified | Approved |
| `src/commands/user/elevate.ts` | Modified | Approved |
| `tests/permissions.test.ts` | New | Approved |
| `tests/admin-guard.test.ts` | New | Approved |

---

## Must Fix

None.

---

## Should Fix

None.

---

## Consider (Informational)

### Consider 1: Variable naming consistency in config.ts

`config.ts` uses `current` as the GuildConfig variable name while all other admin commands use `config`. This is not a bug (it predates this sprint; the earlier code already used `current` to distinguish it from the `updated` result). However, it means the guard call reads `isWatchtowerAdmin(member, current)` rather than `isWatchtowerAdmin(member, config)`. The structural test accommodates both.

**Recommendation:** In a future cleanup sprint, rename `current` to `config` (and `updated` to `saved`) for consistency. Not blocking.

### Consider 2: setDefaultMemberPermissions still set to ManageRoles on assign/revoke/list/unlock

The architecture document notes that `setDefaultMemberPermissions` is Discord UI gating only, not a security gate. The current setting of `ManageRoles` on four commands means the bot management UI is hidden from members who hold the Watchtower Admin role but do NOT hold `Manage Roles`. If the admin role is a custom role without `ManageRoles`, legitimate admins will not see these commands in the Discord client UI.

**Recommendation:** Consider setting `setDefaultMemberPermissions(0n)` (or removing the call) on admin commands so the Watchtower Admin role is the only relevant gate, and Discord's UI hiding is not a confusing mismatch. This is a UX issue, not a security issue. Defer to product decision.

---

## Positive Observations

- `isWatchtowerAdmin()` is correctly pure, synchronous, and has no side effects. It has excellent test coverage (15 unit tests) covering every branch including the critical case where `Administrator` alone is denied in configured mode.
- The guard pattern is completely consistent across all five admin commands — identical import, identical member cast, identical call signature, identical denial message. No room for one command to be missed.
- The `availableRoles` variable in `elevate.ts` is correctly used in both the options builder AND the collector lookup, closing the potential bypass where a user crafts a component interaction with the admin role ID.
- The admin-role assignment warning in `assign.ts` is a nice defensive measure that prevents accidental PIM eligibility grants for the admin role.
- The variable shadowing issue in `revoke.ts` (`member` redeclared inside the `try` block) was caught and fixed during review by renaming the inner variable to `targetMember`.
- Migration is correctly non-destructive: nullable column, no backfill, no data loss.
- Test coverage: 75 tests passing, including 15 unit tests on `isWatchtowerAdmin` and 49 structural tests verifying guard presence across all commands.

---

## Final Verdict

The implementation is correct, consistent, secure, and well-tested. All Must Fix and Should Fix items: none. The two Consider items are informational and can be addressed in a future cleanup sprint.

**Approved for deployment.**
