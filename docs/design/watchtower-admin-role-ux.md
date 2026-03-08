# UX Specification: Watchtower Admin Role

**Feature:** Watchtower Admin Role — Decoupled Bot Management Permissions
**Date:** 2026-03-08

---

## Affected Interactions

1. All five admin commands when the invoking user fails the permission check
2. `/watchtower-config` response embed (new Admin Role field + new option)
3. `/elevate` role selection menu (admin role filtered out)

---

## Interaction 1: Permission Denied Reply

**Trigger:** User invokes any admin command but `isWatchtowerAdmin()` returns false.

**Reply (ephemeral):**
```
You do not have permission to use this command.

A Watchtower Admin role is required. Contact your server owner to be assigned the correct role.
```

**Design rules:**
- Always ephemeral — no public visibility
- No embed — plain text is faster to render and keeps the message lightweight
- Consistent across all five commands — identical wording, no command-specific variation
- No role mention (do not leak the admin role ID to the denied user)

---

## Interaction 2: /watchtower-config — Updated Embed

**Trigger:** User successfully runs `/watchtower-config` (with or without options).

**New option added to command:**
- Name: `admin-role`
- Description: `The role that can manage Watchtower (server owner only)`
- Type: Role
- Required: No

**Updated embed layout:**
```
Watchtower Configuration                                [green accent #57F287]
─────────────────────────────────────────────────────
Session Duration        │  60 minutes
Lockout Threshold       │  5 attempts
Alert Channel           │  #security-alerts  (or "Not set")
Audit Channel           │  #audit-log        (or "Not set")
Admin Role              │  @WatchtowerAdmin  (or "Not set — using Discord Administrator")
─────────────────────────────────────────────────────
[timestamp]
```

**Admin Role field display rules:**
- If `adminRoleId` is set: display as `<@&{adminRoleId}>` (renders as a role mention in Discord)
- If `adminRoleId` is null: display literal text `Not set — using Discord Administrator`
- Field is always shown (not conditional) so the server owner can confirm the current state

**Warning when admin role is changed:**
If the `admin-role` option is provided, append below the embed:
```
Admin role updated. Important: once set, only members with this role can manage Watchtower — including running this command. Ensure you hold this role before proceeding.
```
This is a plain-text follow-up after the embed, same ephemeral reply.

---

## Interaction 3: /elevate — Filtered Role Menu

**Trigger:** User passes password verification and the role dropdown is built.

**Behaviour:**
- Admin role is silently excluded from the options list
- No message is shown explaining why a role is absent (to avoid leaking admin role identity)
- If zero roles remain after filtering:
  ```
  You have no eligible roles available. Contact an administrator.
  ```
  (same message as when no eligible roles are assigned — no information disclosure about the filter)

**Accessibility:**
- The select menu placeholder text remains `Select a role to elevate` (unchanged)
- Role labels remain the Discord role name — no decoration added

---

## Accessibility Requirements

- All replies use `ephemeral: true` — sensitive information is never publicly visible
- No colour-only information — all status is communicated via text
- Error messages are actionable: they tell the user what to do next (contact server owner, run `/set-password`, etc.)
- Embeds use consistent colour coding: green (#57F287) for config/success, no red on success paths

---

## String Inventory

| Location | String |
|---|---|
| Permission denied (all admin commands) | "You do not have permission to use this command.\n\nA Watchtower Admin role is required. Contact your server owner to be assigned the correct role." |
| Config embed — Admin Role field name | "Admin Role" |
| Config embed — Admin Role not set | "Not set — using Discord Administrator" |
| Config embed — Admin Role set | `<@&{roleId}>` |
| Config — post-update warning | "Admin role updated. Important: once set, only members with this role can manage Watchtower — including running this command. Ensure you hold this role before proceeding." |
| Elevate — zero roles after filter | "You have no eligible roles available. Contact an administrator." |
| Permissions fetch error | "Unable to verify your permissions. Please try again." |
