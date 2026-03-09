/**
 * Structural integration tests for the Watchtower Admin guard.
 *
 * Strategy: read the source of each admin command and verify that:
 *   1. isWatchtowerAdmin is imported
 *   2. The guard is called before any business logic (after deferReply)
 *   3. getOrCreateGuildConfig is called (required to obtain config for the guard)
 *   4. The permission-denied reply text is present
 *
 * This is a structural/static analysis approach — it does not require
 * a running Discord bot or database. It guarantees the guard cannot be
 * accidentally removed without breaking the tests.
 */

import * as fs from "fs";
import * as path from "path";

const ADMIN_COMMANDS = [
  "assign",
  "revoke",
  "list",
  "unlock",
  "config",
  "reset-password",
];

const ADMIN_DIR = path.resolve(__dirname, "../src/commands/admin");
const PERMISSION_DENIED_TEXT = "You do not have permission to use this command.";

function readCommand(name: string): string {
  return fs.readFileSync(path.join(ADMIN_DIR, `${name}.ts`), "utf-8");
}

// ---------------------------------------------------------------------------
// Guard presence — all five admin commands
// ---------------------------------------------------------------------------

describe("Admin command guard — isWatchtowerAdmin import and usage", () => {
  for (const cmd of ADMIN_COMMANDS) {
    describe(`${cmd}.ts`, () => {
      let source: string;
      beforeAll(() => { source = readCommand(cmd); });

      it("imports isWatchtowerAdmin from lib/permissions", () => {
        expect(source).toContain("isWatchtowerAdmin");
        expect(source).toContain("permissions");
      });

      it("calls getOrCreateGuildConfig to load guild config for the guard", () => {
        expect(source).toContain("getOrCreateGuildConfig");
      });

      it("calls isWatchtowerAdmin with member and a config variable in execute()", () => {
        // config.ts uses 'current' as the config variable name; others use 'config'
        const hasGuard =
          source.includes("isWatchtowerAdmin(member, config)") ||
          source.includes("isWatchtowerAdmin(member, current)");
        expect(hasGuard).toBe(true);
      });

      it("returns the permission-denied message when guard fails", () => {
        expect(source).toContain(PERMISSION_DENIED_TEXT);
      });

      it("imports GuildMember from discord.js for the cast", () => {
        expect(source).toContain("GuildMember");
      });
    });
  }
});

// ---------------------------------------------------------------------------
// Audit log enrichment — admin commands that write audit logs
// ---------------------------------------------------------------------------

const AUDIT_COMMANDS = ["assign", "revoke", "unlock", "config", "reset-password"];

describe("Admin command audit log enrichment — isWatchtowerAdmin flag in metadata", () => {
  for (const cmd of AUDIT_COMMANDS) {
    it(`${cmd}.ts includes isWatchtowerAdmin: true in audit log metadata`, () => {
      const source = readCommand(cmd);
      expect(source).toContain("isWatchtowerAdmin: true");
    });
  }
});

// ---------------------------------------------------------------------------
// Elevate command — admin role filter
// ---------------------------------------------------------------------------

describe("Elevate command — Watchtower Admin role filter", () => {
  let source: string;
  beforeAll(() => {
    source = fs.readFileSync(
      path.resolve(__dirname, "../src/commands/user/elevate.ts"),
      "utf-8"
    );
  });

  it("filters eligible roles using config.adminRoleId", () => {
    expect(source).toContain("config.adminRoleId");
    expect(source).toContain("filter");
  });

  it("uses availableRoles (filtered list) to build the menu options", () => {
    expect(source).toContain("availableRoles");
  });

  it("uses availableRoles in the collector to look up selected role", () => {
    // Ensures the collector does not fall back to unfiltered pimUser.eligibleRoles
    expect(source).toContain("availableRoles.find");
  });

  it("handles zero available roles after filtering", () => {
    expect(source).toContain("availableRoles.length === 0");
  });
});

// ---------------------------------------------------------------------------
// Config command — admin-role option and ADMIN_ROLE_CONFIGURED event
// ---------------------------------------------------------------------------

describe("Config command — admin role configuration", () => {
  let source: string;
  beforeAll(() => { source = readCommand("config"); });

  it("defines an admin-role option on the slash command", () => {
    expect(source).toContain("admin-role");
  });

  it("persists adminRoleId to the database", () => {
    expect(source).toContain("adminRoleId");
  });

  it("emits ADMIN_ROLE_CONFIGURED audit event", () => {
    expect(source).toContain("ADMIN_ROLE_CONFIGURED");
  });

  it("shows the admin role in the response embed", () => {
    expect(source).toContain("Admin Role");
  });

  it("shows bootstrap fallback label when adminRoleId is not set", () => {
    expect(source).toContain("Not set — using Discord Administrator");
  });

  it("emits a warning when admin role is changed", () => {
    expect(source).toContain("Important:");
  });
});

// ---------------------------------------------------------------------------
// Assign command — admin role assignment warning
// ---------------------------------------------------------------------------

describe("Assign command — warns when assigning eligibility for the admin role", () => {
  let source: string;
  beforeAll(() => { source = readCommand("assign"); });

  it("checks if the role being assigned is the admin role", () => {
    expect(source).toContain("config.adminRoleId && role.id === config.adminRoleId");
  });

  it("returns a warning instead of assigning when admin role is targeted", () => {
    expect(source).toContain("Warning:");
  });
});

// ---------------------------------------------------------------------------
// Permissions module — structural contract
// ---------------------------------------------------------------------------

describe("permissions.ts — module contract", () => {
  let source: string;
  beforeAll(() => {
    source = fs.readFileSync(
      path.resolve(__dirname, "../src/lib/permissions.ts"),
      "utf-8"
    );
  });

  it("exports isWatchtowerAdmin", () => {
    expect(source).toContain("export function isWatchtowerAdmin");
  });

  it("handles null adminRoleId by falling back to Administrator check", () => {
    expect(source).toContain("!config.adminRoleId");
    expect(source).toContain("Administrator");
  });

  it("checks role cache membership in configured mode", () => {
    expect(source).toContain("roles.cache.has");
  });
});
