/**
 * Unit tests for src/lib/permissions.ts — isWatchtowerAdmin()
 *
 * Strategy: construct minimal mock GuildMember and GuildConfig objects
 * to exercise every branch of the permission logic without any Discord
 * or database connections.
 */

import { isWatchtowerAdmin } from "../src/lib/permissions";
import { GuildMember, PermissionsBitField, PermissionFlagsBits } from "discord.js";
import { GuildConfig } from "@prisma/client";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ADMIN_ROLE_ID = "111111111111111111";
const OTHER_ROLE_ID = "222222222222222222";

function buildConfig(adminRoleId: string | null): GuildConfig {
  return {
    id: "cfg1",
    guildId: "guild1",
    sessionDurationMin: 60,
    lockoutThreshold: 5,
    alertChannelId: null,
    auditChannelId: null,
    adminRoleId,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function buildMember({
  hasAdminRole = false,
  hasOtherRole = false,
  hasAdministrator = false,
}: {
  hasAdminRole?: boolean;
  hasOtherRole?: boolean;
  hasAdministrator?: boolean;
}): GuildMember {
  const roleIds = new Set<string>();
  if (hasAdminRole) roleIds.add(ADMIN_ROLE_ID);
  if (hasOtherRole) roleIds.add(OTHER_ROLE_ID);

  const permissions = new PermissionsBitField(
    hasAdministrator ? PermissionFlagsBits.Administrator : 0n
  );

  return {
    roles: {
      cache: {
        has: (id: string) => roleIds.has(id),
      },
    },
    permissions,
  } as unknown as GuildMember;
}

// ---------------------------------------------------------------------------
// Bootstrap mode (adminRoleId = null)
// ---------------------------------------------------------------------------

describe("isWatchtowerAdmin — bootstrap mode (adminRoleId = null)", () => {
  const config = buildConfig(null);

  it("returns true when member has Administrator", () => {
    const member = buildMember({ hasAdministrator: true });
    expect(isWatchtowerAdmin(member, config)).toBe(true);
  });

  it("returns false when member lacks Administrator", () => {
    const member = buildMember({ hasAdministrator: false });
    expect(isWatchtowerAdmin(member, config)).toBe(false);
  });

  it("returns false when member only has Manage Roles (not Administrator)", () => {
    // Manage Roles is not Administrator — simulated by hasAdministrator: false
    const member = buildMember({ hasAdministrator: false, hasOtherRole: true });
    expect(isWatchtowerAdmin(member, config)).toBe(false);
  });

  it("returns true when member has both Administrator and the admin role (role not configured)", () => {
    const member = buildMember({ hasAdministrator: true, hasAdminRole: true });
    expect(isWatchtowerAdmin(member, config)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Bootstrap mode (adminRoleId = empty string — treated as null)
// ---------------------------------------------------------------------------

describe("isWatchtowerAdmin — empty string adminRoleId treated as null", () => {
  const config = buildConfig("");

  it("returns true when member has Administrator (empty string = bootstrap mode)", () => {
    const member = buildMember({ hasAdministrator: true });
    expect(isWatchtowerAdmin(member, config)).toBe(true);
  });

  it("returns false when member lacks Administrator", () => {
    const member = buildMember({ hasAdministrator: false });
    expect(isWatchtowerAdmin(member, config)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Configured mode (adminRoleId = set)
// ---------------------------------------------------------------------------

describe("isWatchtowerAdmin — configured mode (adminRoleId set)", () => {
  const config = buildConfig(ADMIN_ROLE_ID);

  it("returns true when member holds the Watchtower Admin role", () => {
    const member = buildMember({ hasAdminRole: true });
    expect(isWatchtowerAdmin(member, config)).toBe(true);
  });

  it("returns false when member does not hold the Watchtower Admin role", () => {
    const member = buildMember({ hasAdminRole: false });
    expect(isWatchtowerAdmin(member, config)).toBe(false);
  });

  it("returns false when member has Administrator but NOT the admin role — core security requirement", () => {
    const member = buildMember({ hasAdministrator: true, hasAdminRole: false });
    expect(isWatchtowerAdmin(member, config)).toBe(false);
  });

  it("returns true when member has both Administrator AND the admin role", () => {
    const member = buildMember({ hasAdministrator: true, hasAdminRole: true });
    expect(isWatchtowerAdmin(member, config)).toBe(true);
  });

  it("returns false when member holds an unrelated role but not the admin role", () => {
    const member = buildMember({ hasOtherRole: true, hasAdminRole: false });
    expect(isWatchtowerAdmin(member, config)).toBe(false);
  });

  it("returns false when member holds no roles at all", () => {
    const member = buildMember({});
    expect(isWatchtowerAdmin(member, config)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Source-level checks (structural guarantees)
// ---------------------------------------------------------------------------

describe("isWatchtowerAdmin — structural guarantees", () => {
  it("is a synchronous function (returns boolean, not Promise)", () => {
    const config = buildConfig(null);
    const member = buildMember({ hasAdministrator: true });
    const result = isWatchtowerAdmin(member, config);
    expect(typeof result).toBe("boolean");
    // Must not be a Promise
    expect(result).not.toBeInstanceOf(Promise);
  });

  it("module does not import the DB client (pure function, no DB calls)", () => {
    const fs = require("fs");
    const path = require("path");
    const source: string = fs.readFileSync(
      path.resolve(__dirname, "../src/lib/permissions.ts"),
      "utf-8"
    );
    // Must not import the Prisma singleton or execute any DB queries.
    // Importing GuildConfig as a TYPE from @prisma/client is allowed.
    expect(source).not.toContain("from \"../../lib/database\"");
    expect(source).not.toContain("db.");
    expect(source).not.toContain("PrismaClient");
  });

  it("module does not make async calls", () => {
    const fs = require("fs");
    const path = require("path");
    const source: string = fs.readFileSync(
      path.resolve(__dirname, "../src/lib/permissions.ts"),
      "utf-8"
    );
    expect(source).not.toContain("await ");
    expect(source).not.toContain("async ");
  });
});
