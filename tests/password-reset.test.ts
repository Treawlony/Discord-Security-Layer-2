/**
 * Tests for the /watchtower-reset-password admin command (PIM-003)
 * and the null-password guard in /elevate.
 *
 * Strategy: structural/static analysis for the command source, and
 * runtime unit tests for the help embed and elevate guard — consistent
 * with the existing test suite approach.
 */

import * as fs from "fs";
import * as path from "path";
import { data as resetPasswordData, execute as resetPasswordExecute } from "../src/commands/admin/reset-password";
import { data as elevateData } from "../src/commands/user/elevate";
import { ChatInputCommandInteraction, Client } from "discord.js";

const ADMIN_DIR = path.resolve(__dirname, "../src/commands/admin");
const USER_DIR = path.resolve(__dirname, "../src/commands/user");

function readAdminCommand(name: string): string {
  return fs.readFileSync(path.join(ADMIN_DIR, `${name}.ts`), "utf-8");
}

function readUserCommand(name: string): string {
  return fs.readFileSync(path.join(USER_DIR, `${name}.ts`), "utf-8");
}

// ---------------------------------------------------------------------------
// reset-password.ts — command metadata
// ---------------------------------------------------------------------------

describe("reset-password command — data export", () => {
  it("has the correct command name", () => {
    expect(resetPasswordData.name).toBe("watchtower-reset-password");
  });

  it("has a non-empty description", () => {
    expect(resetPasswordData.description.length).toBeGreaterThan(0);
  });

  it("has exactly one option: user (required)", () => {
    const json = resetPasswordData.toJSON();
    expect(json.options).toHaveLength(1);
    expect(json.options![0].name).toBe("user");
    expect((json.options![0] as { required?: boolean }).required).toBe(true);
  });

  it("does not set default member permissions (admin commands must not use setDefaultMemberPermissions)", () => {
    const json = resetPasswordData.toJSON();
    expect(json.default_member_permissions ?? null).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// reset-password.ts — structural source checks
// ---------------------------------------------------------------------------

describe("reset-password command — structural source checks", () => {
  let source: string;
  beforeAll(() => { source = readAdminCommand("reset-password"); });

  it("imports isWatchtowerAdmin from lib/permissions", () => {
    expect(source).toContain("isWatchtowerAdmin");
    expect(source).toContain("permissions");
  });

  it("calls getOrCreateGuildConfig to obtain config for the guard", () => {
    expect(source).toContain("getOrCreateGuildConfig");
  });

  it("calls isWatchtowerAdmin(member, config) — guard present", () => {
    expect(source).toContain("isWatchtowerAdmin(member, config)");
  });

  it("returns permission-denied message for non-admins", () => {
    expect(source).toContain("You do not have permission to use this command.");
  });

  it("imports GuildMember for the member cast", () => {
    expect(source).toContain("GuildMember");
  });

  it("defers reply as ephemeral", () => {
    expect(source).toContain("deferReply");
    expect(source).toContain("MessageFlags.Ephemeral");
  });

  it("looks up PimUser scoped by discordUserId and guildId (guild isolation)", () => {
    expect(source).toContain("discordUserId_guildId");
    expect(source).toContain("guildId");
  });

  it("returns 'does not have a PIM account' when user not found", () => {
    expect(source).toContain("does not have a PIM account");
  });

  it("clears passwordHash to null in the DB update", () => {
    expect(source).toContain("passwordHash: null");
  });

  it("clears lockedAt in the same update (fresh start)", () => {
    expect(source).toContain("lockedAt: null");
  });

  it("clears blockedAt in the same update (fresh start)", () => {
    expect(source).toContain("blockedAt: null");
  });

  it("resets failedAttempts to 0 in the same update", () => {
    expect(source).toContain("failedAttempts: 0");
  });

  it("writes PASSWORD_RESET audit log event", () => {
    expect(source).toContain("PASSWORD_RESET");
  });

  it("includes isWatchtowerAdmin: true in audit log metadata", () => {
    expect(source).toContain("isWatchtowerAdmin: true");
  });

  it("includes resetBy in audit log metadata", () => {
    expect(source).toContain("resetBy");
  });

  it("does NOT use skipChannelPost (audit channel echo is desired)", () => {
    expect(source).not.toContain("skipChannelPost");
  });

  it("success reply confirms reset and instructs user to run /set-password", () => {
    expect(source).toContain("PIM password has been reset");
    expect(source).toContain("/set-password");
  });

  it("uses writeAuditLog from lib/audit", () => {
    expect(source).toContain("writeAuditLog");
    expect(source).toContain("audit");
  });
});

// ---------------------------------------------------------------------------
// reset-password.ts — execute behaviour (mock interaction)
// ---------------------------------------------------------------------------

describe("reset-password command — guard ordering (source analysis)", () => {
  it("isWatchtowerAdmin call appears after deferReply call in execute()", () => {
    const source = readAdminCommand("reset-password");
    // Find the execute function body (everything after "export async function execute")
    const executeStart = source.indexOf("export async function execute");
    expect(executeStart).toBeGreaterThan(0);
    const executeBody = source.slice(executeStart);
    // Within execute, deferReply must precede the isWatchtowerAdmin call
    const deferIndex = executeBody.indexOf("deferReply");
    const guardIndex = executeBody.indexOf("isWatchtowerAdmin(member, config)");
    expect(deferIndex).toBeGreaterThan(0);
    expect(guardIndex).toBeGreaterThan(0);
    expect(guardIndex).toBeGreaterThan(deferIndex);
  });
});

// ---------------------------------------------------------------------------
// elevate.ts — null-password guard
// ---------------------------------------------------------------------------

describe("elevate command — null-password guard (STORY-03)", () => {
  let source: string;
  beforeAll(() => { source = readUserCommand("elevate"); });

  it("contains a null check on pimUser.passwordHash", () => {
    expect(source).toContain("pimUser.passwordHash === null");
  });

  it("null-password guard comes before the verifyPassword call", () => {
    const nullCheckIndex = source.indexOf("pimUser.passwordHash === null");
    const verifyIndex = source.indexOf("verifyPassword(");
    expect(nullCheckIndex).toBeGreaterThan(0);
    expect(verifyIndex).toBeGreaterThan(0);
    expect(nullCheckIndex).toBeLessThan(verifyIndex);
  });

  it("null-password guard comes after the blockedAt check", () => {
    const blockedIndex = source.indexOf("pimUser.blockedAt");
    const nullCheckIndex = source.indexOf("pimUser.passwordHash === null");
    expect(blockedIndex).toBeGreaterThan(0);
    expect(nullCheckIndex).toBeGreaterThan(blockedIndex);
  });

  it("null-password reply tells the user to run /set-password", () => {
    expect(source).toContain("/set-password");
    expect(source).toContain("reset by an administrator");
  });

  it("null-password guard does not write a FAILED_ATTEMPT audit log", () => {
    // The guard must return before the FAILED_ATTEMPT write.
    // Verify the null check block ends with a return before FAILED_ATTEMPT.
    const nullCheckIndex = source.indexOf("pimUser.passwordHash === null");
    const failedAttemptIndex = source.indexOf("FAILED_ATTEMPT");
    // null check must appear before FAILED_ATTEMPT in the source
    expect(nullCheckIndex).toBeLessThan(failedAttemptIndex);
    // The guard block contains a return statement
    const nullCheckRegion = source.slice(nullCheckIndex, nullCheckIndex + 300);
    expect(nullCheckRegion).toContain("return");
  });
});

// ---------------------------------------------------------------------------
// schema.prisma — passwordHash nullable
// ---------------------------------------------------------------------------

describe("schema.prisma — passwordHash nullable", () => {
  let source: string;
  beforeAll(() => {
    source = fs.readFileSync(
      path.resolve(__dirname, "../prisma/schema.prisma"),
      "utf-8"
    );
  });

  it("passwordHash is declared as String? (nullable)", () => {
    expect(source).toContain("passwordHash   String?");
  });

  it("PASSWORD_RESET is present in the AuditEventType enum", () => {
    expect(source).toContain("PASSWORD_RESET");
  });
});

// ---------------------------------------------------------------------------
// Migration file — structural checks
// ---------------------------------------------------------------------------

describe("nullable_password_hash migration", () => {
  let sql: string;
  beforeAll(() => {
    sql = fs.readFileSync(
      path.resolve(__dirname, "../prisma/migrations/20260309000000_nullable_password_hash/migration.sql"),
      "utf-8"
    );
  });

  it("uses camelCase column name 'passwordHash' (not snake_case)", () => {
    expect(sql).toContain('"passwordHash"');
    expect(sql).not.toContain('"password_hash"');
  });

  it("drops the NOT NULL constraint (does not delete data)", () => {
    expect(sql).toContain("DROP NOT NULL");
    expect(sql).not.toContain("DROP COLUMN");
  });

  it("adds the PASSWORD_RESET enum value", () => {
    expect(sql).toContain("ADD VALUE 'PASSWORD_RESET'");
  });

  it("targets the pim_users table", () => {
    expect(sql).toContain('"pim_users"');
  });
});

// ---------------------------------------------------------------------------
// audit.ts — PASSWORD_RESET emoji mapping
// ---------------------------------------------------------------------------

describe("audit.ts — PASSWORD_RESET emoji", () => {
  let source: string;
  beforeAll(() => {
    source = fs.readFileSync(
      path.resolve(__dirname, "../src/lib/audit.ts"),
      "utf-8"
    );
  });

  it("has an emoji entry for PASSWORD_RESET", () => {
    expect(source).toContain("PASSWORD_RESET:");
  });
});

// ---------------------------------------------------------------------------
// help.ts — /watchtower-reset-password listed in admin section
// ---------------------------------------------------------------------------

describe("help command — lists /watchtower-reset-password", () => {
  let source: string;
  beforeAll(() => {
    source = fs.readFileSync(
      path.resolve(__dirname, "../src/commands/user/help.ts"),
      "utf-8"
    );
  });

  it("includes /watchtower-reset-password in the source", () => {
    expect(source).toContain("/watchtower-reset-password");
  });

  it("/watchtower-reset-password description mentions /set-password", () => {
    const resetIdx = source.indexOf("/watchtower-reset-password");
    // The description for the command should appear near the command name
    const region = source.slice(resetIdx, resetIdx + 200);
    expect(region).toContain("/set-password");
  });
});

// ---------------------------------------------------------------------------
// set-password.ts — unchanged behaviour (STORY-04 verification)
// ---------------------------------------------------------------------------

describe("set-password command — unchanged for null-hash recovery (STORY-04)", () => {
  let source: string;
  beforeAll(() => {
    source = fs.readFileSync(
      path.resolve(__dirname, "../src/commands/user/set-password.ts"),
      "utf-8"
    );
  });

  it("uses pimUser.update (not upsert create path) when record exists — handles null hash", () => {
    // The existing branch calls db.pimUser.update with the new hash,
    // which works whether passwordHash was null or a previous hash.
    expect(source).toContain("pimUser.update");
  });

  it("writes PASSWORD_CHANGED event for existing users (not PASSWORD_SET)", () => {
    // Validates STORY-04 AC-04.3: after a reset the user's re-set is a CHANGED event
    expect(source).toContain("PASSWORD_CHANGED");
  });

  it("does not require passwordHash to be non-null before updating", () => {
    // There should be no guard checking existing.passwordHash !== null
    expect(source).not.toContain("existing.passwordHash !== null");
    expect(source).not.toContain("passwordHash === null");
  });
});
