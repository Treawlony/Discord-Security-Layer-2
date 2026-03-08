/**
 * Unit tests for Role Expiry Notifications (EPIC-003)
 *
 * Strategy: pure unit tests using mocks — no DB, no Discord API.
 * Each test focuses on a single behaviour or security boundary.
 */

import { GuildConfig } from "@prisma/client";
import { GuildMember, PermissionsBitField, PermissionFlagsBits } from "discord.js";

// ---------------------------------------------------------------------------
// Helper: build a minimal GuildConfig with defaults
// ---------------------------------------------------------------------------
const ADMIN_ROLE_ID = "111111111111111111";

function buildConfig(overrides: Partial<GuildConfig> = {}): GuildConfig {
  return {
    id: "cfg1",
    guildId: "guild1",
    sessionDurationSec: 3600,
    lockoutThreshold: 5,
    alertChannelId: null,
    auditChannelId: "audit-channel-id",
    adminRoleId: ADMIN_ROLE_ID,
    notifyBeforeSec: 300,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Helper: build a minimal GuildMember mock
// ---------------------------------------------------------------------------
function buildMember(opts: {
  hasAdminRole?: boolean;
  hasAdministrator?: boolean;
} = {}): GuildMember {
  const roleIds = new Set<string>();
  if (opts.hasAdminRole) roleIds.add(ADMIN_ROLE_ID);
  const permissions = new PermissionsBitField(
    opts.hasAdministrator ? PermissionFlagsBits.Administrator : 0n
  );
  return {
    roles: { cache: { has: (id: string) => roleIds.has(id) } },
    permissions,
  } as unknown as GuildMember;
}

// ---------------------------------------------------------------------------
// Section 1: Schema — new fields present in GuildConfig type
// ---------------------------------------------------------------------------

describe("GuildConfig schema — notifyBeforeSec field", () => {
  it("config object includes notifyBeforeSec field", () => {
    const config = buildConfig();
    expect(config).toHaveProperty("notifyBeforeSec");
  });

  it("default notifyBeforeSec is 300 (5 minutes)", () => {
    const config = buildConfig();
    expect(config.notifyBeforeSec).toBe(300);
  });

  it("notifyBeforeSec can be set to 0 (disabled)", () => {
    const config = buildConfig({ notifyBeforeSec: 0 });
    expect(config.notifyBeforeSec).toBe(0);
  });

  it("notifyBeforeSec can be set to 3600 (1 hour)", () => {
    const config = buildConfig({ notifyBeforeSec: 3600 });
    expect(config.notifyBeforeSec).toBe(3600);
  });
});

// ---------------------------------------------------------------------------
// Section 2: Migration SQL — camelCase column names
// ---------------------------------------------------------------------------

describe("Migration SQL — camelCase column names", () => {
  const fs = require("fs");
  const path = require("path");
  const migrationPath = path.resolve(
    __dirname,
    "../prisma/migrations/20260308000001_add_expiry_notifications/migration.sql"
  );
  let sql: string;

  beforeAll(() => {
    sql = fs.readFileSync(migrationPath, "utf-8");
  });

  it("migration file exists", () => {
    expect(fs.existsSync(migrationPath)).toBe(true);
  });

  it("uses camelCase notifyBeforeMin (not snake_case)", () => {
    expect(sql).toContain('"notifyBeforeMin"');
    expect(sql).not.toContain("notify_before_min");
  });

  it("uses camelCase notifiedAt (not snake_case)", () => {
    expect(sql).toContain('"notifiedAt"');
    expect(sql).not.toContain("notified_at");
  });

  it("uses camelCase blockedAt (not snake_case)", () => {
    expect(sql).toContain('"blockedAt"');
    expect(sql).not.toContain("blocked_at");
  });

  it("notifyBeforeMin has DEFAULT 5", () => {
    expect(sql).toContain("DEFAULT 5");
  });

  it("adds all five new AuditEventType enum values", () => {
    expect(sql).toContain("ELEVATION_EXPIRY_WARNING");
    expect(sql).toContain("ELEVATION_EXTENDED");
    expect(sql).toContain("ELEVATION_ADMIN_REVOKED");
    expect(sql).toContain("ELEVATION_ADMIN_REVOKED_BLOCKED");
    expect(sql).toContain("ELEVATION_BLOCKED");
  });

  it("does not use DROP or destructive statements", () => {
    const upperSql = sql.toUpperCase();
    expect(upperSql).not.toContain("DROP TABLE");
    expect(upperSql).not.toContain("DROP COLUMN");
    expect(upperSql).not.toContain("TRUNCATE");
  });
});

// ---------------------------------------------------------------------------
// Section 2b: New migration — duration_in_seconds
// ---------------------------------------------------------------------------

describe("Migration SQL — duration_in_seconds camelCase column names", () => {
  const fs = require("fs");
  const path = require("path");
  const migrationPath = path.resolve(
    __dirname,
    "../prisma/migrations/20260308000002_duration_in_seconds/migration.sql"
  );
  let sql: string;

  beforeAll(() => {
    sql = fs.readFileSync(migrationPath, "utf-8");
  });

  it("migration file exists", () => {
    expect(fs.existsSync(migrationPath)).toBe(true);
  });

  it("uses camelCase sessionDurationSec (not snake_case)", () => {
    expect(sql).toContain('"sessionDurationSec"');
    expect(sql).not.toContain("session_duration_sec");
  });

  it("uses camelCase notifyBeforeSec (not snake_case)", () => {
    expect(sql).toContain('"notifyBeforeSec"');
    expect(sql).not.toContain("notify_before_sec");
  });

  it("uses camelCase sessionDurationMin for the old column reference", () => {
    expect(sql).toContain('"sessionDurationMin"');
    expect(sql).not.toContain("session_duration_min");
  });

  it("uses camelCase notifyBeforeMin for the old column reference", () => {
    expect(sql).toContain('"notifyBeforeMin"');
    expect(sql).not.toContain("notify_before_min");
  });

  it("converts minutes to seconds by multiplying by 60", () => {
    expect(sql).toContain("* 60");
  });

  it("sets new default of 3600 for sessionDurationSec", () => {
    expect(sql).toContain("DEFAULT 3600");
  });

  it("sets new default of 300 for notifyBeforeSec", () => {
    expect(sql).toContain("DEFAULT 300");
  });

  it("does not DROP TABLE or TRUNCATE", () => {
    const upperSql = sql.toUpperCase();
    expect(upperSql).not.toContain("DROP TABLE");
    expect(upperSql).not.toContain("TRUNCATE");
  });
});

// ---------------------------------------------------------------------------
// Section 3: Prisma schema — new fields present in schema.prisma
// ---------------------------------------------------------------------------

describe("Prisma schema — new fields", () => {
  const fs = require("fs");
  const path = require("path");
  const schemaPath = path.resolve(__dirname, "../prisma/schema.prisma");
  let schema: string;

  beforeAll(() => {
    schema = fs.readFileSync(schemaPath, "utf-8");
  });

  it("GuildConfig has notifyBeforeSec with default 300", () => {
    expect(schema).toContain("notifyBeforeSec");
    expect(schema).toContain("@default(300)");
  });

  it("ActiveElevation has notifiedAt as nullable", () => {
    expect(schema).toContain("notifiedAt  DateTime?");
  });

  it("PimUser has blockedAt as nullable", () => {
    expect(schema).toContain("blockedAt");
  });

  it("AuditEventType enum includes all five new values", () => {
    expect(schema).toContain("ELEVATION_EXPIRY_WARNING");
    expect(schema).toContain("ELEVATION_EXTENDED");
    expect(schema).toContain("ELEVATION_ADMIN_REVOKED");
    expect(schema).toContain("ELEVATION_ADMIN_REVOKED_BLOCKED");
    expect(schema).toContain("ELEVATION_BLOCKED");
  });
});

// ---------------------------------------------------------------------------
// Section 4: audit.ts — new emoji mappings
// ---------------------------------------------------------------------------

describe("audit.ts — new event type emoji mappings", () => {
  const fs = require("fs");
  const path = require("path");
  const auditPath = path.resolve(__dirname, "../src/lib/audit.ts");
  let source: string;

  beforeAll(() => {
    source = fs.readFileSync(auditPath, "utf-8");
  });

  it("maps ELEVATION_EXPIRY_WARNING to an emoji", () => {
    expect(source).toContain("ELEVATION_EXPIRY_WARNING:");
  });

  it("maps ELEVATION_EXTENDED to an emoji", () => {
    expect(source).toContain("ELEVATION_EXTENDED:");
  });

  it("maps ELEVATION_ADMIN_REVOKED to an emoji", () => {
    expect(source).toContain("ELEVATION_ADMIN_REVOKED:");
  });

  it("maps ELEVATION_ADMIN_REVOKED_BLOCKED to an emoji", () => {
    expect(source).toContain("ELEVATION_ADMIN_REVOKED_BLOCKED:");
  });

  it("maps ELEVATION_BLOCKED to an emoji", () => {
    expect(source).toContain("ELEVATION_BLOCKED:");
  });
});

// ---------------------------------------------------------------------------
// Section 5: buttonHandlers.ts — source-level structural checks
// ---------------------------------------------------------------------------

describe("buttonHandlers.ts — structural checks", () => {
  const fs = require("fs");
  const path = require("path");
  const src = path.resolve(__dirname, "../src/lib/buttonHandlers.ts");
  let source: string;

  beforeAll(() => {
    source = fs.readFileSync(src, "utf-8");
  });

  it("exports handleExtendSession", () => {
    expect(source).toContain("export async function handleExtendSession");
  });

  it("exports handleRemovePerm", () => {
    expect(source).toContain("export async function handleRemovePerm");
  });

  it("exports handleRemovePermBlock", () => {
    expect(source).toContain("export async function handleRemovePermBlock");
  });

  it("handleExtendSession calls deferReply with Ephemeral flag", () => {
    // Extract just the handleExtendSession function text
    const fnStart = source.indexOf("export async function handleExtendSession");
    const fnEnd = source.indexOf("\nexport async function handleRemovePerm");
    const fnText = source.slice(fnStart, fnEnd);
    expect(fnText).toContain("deferReply");
    expect(fnText).toContain("MessageFlags.Ephemeral");
  });

  it("handleRemovePerm calls deferReply with Ephemeral flag", () => {
    const fnStart = source.indexOf("export async function handleRemovePerm(");
    const fnEnd = source.indexOf("\nexport async function handleRemovePermBlock");
    const fnText = source.slice(fnStart, fnEnd);
    expect(fnText).toContain("deferReply");
    expect(fnText).toContain("MessageFlags.Ephemeral");
  });

  it("handleRemovePermBlock calls deferReply with Ephemeral flag", () => {
    const fnStart = source.indexOf("export async function handleRemovePermBlock");
    const fnText = source.slice(fnStart);
    expect(fnText).toContain("deferReply");
    expect(fnText).toContain("MessageFlags.Ephemeral");
  });

  it("handleExtendSession checks interaction.user.id against elevation user", () => {
    const fnStart = source.indexOf("export async function handleExtendSession");
    const fnEnd = source.indexOf("\nexport async function handleRemovePerm");
    const fnText = source.slice(fnStart, fnEnd);
    expect(fnText).toContain("interaction.user.id");
    expect(fnText).toContain("discordUserId");
  });

  it("handleRemovePerm calls isWatchtowerAdmin", () => {
    const fnStart = source.indexOf("export async function handleRemovePerm(");
    const fnEnd = source.indexOf("\nexport async function handleRemovePermBlock");
    const fnText = source.slice(fnStart, fnEnd);
    expect(fnText).toContain("isWatchtowerAdmin");
  });

  it("handleRemovePermBlock calls isWatchtowerAdmin", () => {
    const fnStart = source.indexOf("export async function handleRemovePermBlock");
    const fnText = source.slice(fnStart);
    expect(fnText).toContain("isWatchtowerAdmin");
  });

  it("handleRemovePermBlock sets blockedAt on PimUser", () => {
    const fnStart = source.indexOf("export async function handleRemovePermBlock");
    const fnText = source.slice(fnStart);
    expect(fnText).toContain("blockedAt");
  });

  it("handleExtendSession clears notifiedAt (sets to null) on extension", () => {
    const fnStart = source.indexOf("export async function handleExtendSession");
    const fnEnd = source.indexOf("\nexport async function handleRemovePerm");
    const fnText = source.slice(fnStart, fnEnd);
    expect(fnText).toContain("notifiedAt: null");
  });

  it("handleExtendSession writes ELEVATION_EXTENDED audit log", () => {
    const fnStart = source.indexOf("export async function handleExtendSession");
    const fnEnd = source.indexOf("\nexport async function handleRemovePerm");
    const fnText = source.slice(fnStart, fnEnd);
    expect(fnText).toContain("ELEVATION_EXTENDED");
  });

  it("handleRemovePerm writes ELEVATION_ADMIN_REVOKED audit log", () => {
    const fnStart = source.indexOf("export async function handleRemovePerm(");
    const fnEnd = source.indexOf("\nexport async function handleRemovePermBlock");
    const fnText = source.slice(fnStart, fnEnd);
    expect(fnText).toContain("ELEVATION_ADMIN_REVOKED");
  });

  it("handleRemovePermBlock writes ELEVATION_ADMIN_REVOKED_BLOCKED and ELEVATION_BLOCKED audit logs", () => {
    const fnStart = source.indexOf("export async function handleRemovePermBlock");
    const fnText = source.slice(fnStart);
    expect(fnText).toContain("ELEVATION_ADMIN_REVOKED_BLOCKED");
    expect(fnText).toContain("ELEVATION_BLOCKED");
  });

  it("does not use deprecated ephemeral: true syntax", () => {
    expect(source).not.toContain("ephemeral: true");
  });

  it("non-fatal Discord API calls are wrapped in try/catch", () => {
    // All three functions try/catch role removal and message update
    const tryCatchCount = (source.match(/} catch/g) ?? []).length;
    expect(tryCatchCount).toBeGreaterThanOrEqual(3);
  });
});

// ---------------------------------------------------------------------------
// Section 5b: audit.ts — skipChannelPost flag prevents duplicate messages
// ---------------------------------------------------------------------------

describe("audit.ts — skipChannelPost prevents duplicate audit channel messages", () => {
  const fs = require("fs");
  const path = require("path");

  it("AuditParams interface includes optional skipChannelPost field", () => {
    const source: string = fs.readFileSync(
      path.resolve(__dirname, "../src/lib/audit.ts"), "utf-8"
    );
    expect(source).toContain("skipChannelPost?");
  });

  it("channel post is gated on !params.skipChannelPost", () => {
    const source: string = fs.readFileSync(
      path.resolve(__dirname, "../src/lib/audit.ts"), "utf-8"
    );
    expect(source).toContain("!params.skipChannelPost");
  });

  it("elevate.ts sets skipChannelPost: true on ELEVATION_GRANTED writeAuditLog call", () => {
    const source: string = fs.readFileSync(
      path.resolve(__dirname, "../src/commands/user/elevate.ts"), "utf-8"
    );
    const grantedIdx = source.indexOf("ELEVATION_GRANTED");
    const snippet = source.slice(Math.max(0, grantedIdx - 300), grantedIdx + 300);
    expect(snippet).toContain("skipChannelPost: true");
  });

  it("expireElevations.ts sets skipChannelPost: true on ELEVATION_EXPIRY_WARNING writeAuditLog call", () => {
    const source: string = fs.readFileSync(
      path.resolve(__dirname, "../src/jobs/expireElevations.ts"), "utf-8"
    );
    const warningIdx = source.indexOf("ELEVATION_EXPIRY_WARNING");
    const snippet = source.slice(Math.max(0, warningIdx - 300), warningIdx + 300);
    expect(snippet).toContain("skipChannelPost: true");
  });
});

// ---------------------------------------------------------------------------
// Section 6: interactionCreate.ts — button routing order
// ---------------------------------------------------------------------------

describe("interactionCreate.ts — button routing", () => {
  const fs = require("fs");
  const path = require("path");
  const src = path.resolve(__dirname, "../src/events/interactionCreate.ts");
  let source: string;

  beforeAll(() => {
    source = fs.readFileSync(src, "utf-8");
  });

  it("routes extend_session: prefix", () => {
    expect(source).toContain("extend_session:");
  });

  it("routes remove_perm_block: prefix", () => {
    expect(source).toContain("remove_perm_block:");
  });

  it("routes remove_perm: prefix", () => {
    expect(source).toContain("remove_perm:");
  });

  it("checks remove_perm_block: BEFORE remove_perm: to avoid prefix collision", () => {
    const blockIdx = source.indexOf("remove_perm_block:");
    const permIdx = source.lastIndexOf('"remove_perm:"') !== -1
      ? source.lastIndexOf('"remove_perm:"')
      : source.indexOf("remove_perm:");
    // remove_perm_block: must appear before remove_perm: in the routing logic
    expect(blockIdx).toBeLessThan(permIdx);
  });

  it("includes isButton() guard", () => {
    expect(source).toContain("isButton()");
  });

  it("imports all three button handlers", () => {
    expect(source).toContain("handleExtendSession");
    expect(source).toContain("handleRemovePerm");
    expect(source).toContain("handleRemovePermBlock");
  });
});

// ---------------------------------------------------------------------------
// Section 7: expireElevations.ts — warning scan structure
// ---------------------------------------------------------------------------

describe("expireElevations.ts — warning scan", () => {
  const fs = require("fs");
  const path = require("path");
  const src = path.resolve(__dirname, "../src/jobs/expireElevations.ts");
  let source: string;

  beforeAll(() => {
    source = fs.readFileSync(src, "utf-8");
  });

  it("defines runWarningScan function", () => {
    expect(source).toContain("async function runWarningScan");
  });

  it("defines runExpiryScan function", () => {
    expect(source).toContain("async function runExpiryScan");
  });

  it("warning scan queries notifyBeforeSec > 0", () => {
    expect(source).toContain("notifyBeforeSec: { gt: 0 }");
  });

  it("warning scan filters notifiedAt: null", () => {
    expect(source).toContain("notifiedAt: null");
  });

  it("warning scan sets notifiedAt after posting", () => {
    expect(source).toContain("notifiedAt: new Date()");
  });

  it("warning scan uses extend_session: customId prefix for button", () => {
    expect(source).toContain("extend_session:");
  });

  it("warning scan writes ELEVATION_EXPIRY_WARNING audit log", () => {
    expect(source).toContain("ELEVATION_EXPIRY_WARNING");
  });

  it("warning scan runs before expiry scan in cron callback", () => {
    const warnIdx = source.indexOf("runWarningScan");
    const expiryIdx = source.indexOf("runExpiryScan");
    expect(warnIdx).toBeLessThan(expiryIdx);
  });

  it("does not use deprecated ephemeral: true syntax", () => {
    expect(source).not.toContain("ephemeral: true");
  });

  it("wraps channel post in try/catch (non-fatal)", () => {
    expect(source).toContain("} catch (err)");
  });
});

// ---------------------------------------------------------------------------
// Section 8: elevate.ts — blockedAt check and button post
// ---------------------------------------------------------------------------

describe("elevate.ts — blockedAt and elevation-granted buttons", () => {
  const fs = require("fs");
  const path = require("path");
  const src = path.resolve(__dirname, "../src/commands/user/elevate.ts");
  let source: string;

  beforeAll(() => {
    source = fs.readFileSync(src, "utf-8");
  });

  it("checks blockedAt before proceeding", () => {
    expect(source).toContain("pimUser.blockedAt");
  });

  it("blockedAt check returns an informative error message", () => {
    expect(source).toContain("blocked by an administrator");
  });

  it("blockedAt check appears after lockedAt check", () => {
    const lockedIdx = source.indexOf("pimUser.lockedAt");
    const blockedIdx = source.indexOf("pimUser.blockedAt");
    expect(lockedIdx).toBeLessThan(blockedIdx);
  });

  it("posts remove_perm: button on elevation grant", () => {
    expect(source).toContain("remove_perm:");
  });

  it("posts remove_perm_block: button on elevation grant", () => {
    expect(source).toContain("remove_perm_block:");
  });

  it("posts buttons to auditChannelId", () => {
    expect(source).toContain("auditChannelId");
  });

  it("falls back to alertChannelId plain text when auditChannelId is null", () => {
    expect(source).toContain("alertChannelId");
  });

  it("clears notifiedAt on elevation upsert", () => {
    expect(source).toContain("notifiedAt: null");
  });

  it("uses ButtonStyle.Danger for admin action buttons", () => {
    expect(source).toContain("ButtonStyle.Danger");
  });

  it("does not use deprecated ephemeral: true", () => {
    expect(source).not.toContain("ephemeral: true");
  });
});

// ---------------------------------------------------------------------------
// Section 9: unlock.ts — blockedAt clearing
// ---------------------------------------------------------------------------

describe("unlock.ts — blockedAt cleared on unlock", () => {
  const fs = require("fs");
  const path = require("path");
  const src = path.resolve(__dirname, "../src/commands/admin/unlock.ts");
  let source: string;

  beforeAll(() => {
    source = fs.readFileSync(src, "utf-8");
  });

  it("clears blockedAt in the pimUser update", () => {
    expect(source).toContain("blockedAt: null");
  });

  it("guard checks both lockedAt and blockedAt", () => {
    expect(source).toContain("!pimUser.lockedAt && !pimUser.blockedAt");
  });

  it("audit metadata includes clearedBlock field", () => {
    expect(source).toContain("clearedBlock");
  });

  it("calls isWatchtowerAdmin", () => {
    expect(source).toContain("isWatchtowerAdmin");
  });

  it("calls deferReply", () => {
    expect(source).toContain("deferReply");
  });

  it("does not use deprecated ephemeral: true", () => {
    expect(source).not.toContain("ephemeral: true");
  });
});

// ---------------------------------------------------------------------------
// Section 10: config.ts — notify-before option
// ---------------------------------------------------------------------------

describe("config.ts — notify-before option", () => {
  const fs = require("fs");
  const path = require("path");
  const src = path.resolve(__dirname, "../src/commands/admin/config.ts");
  let source: string;

  beforeAll(() => {
    source = fs.readFileSync(src, "utf-8");
  });

  it("defines notify-before option on the SlashCommandBuilder", () => {
    expect(source).toContain('"notify-before"');
  });

  it("notify-before uses addStringOption (accepts human-readable durations)", () => {
    // The option is now a string option so users can enter e.g. "5m", "1h"
    expect(source).toContain("addStringOption");
  });

  it("persists notifyBeforeSec in the config update", () => {
    expect(source).toContain("notifyBeforeSec:");
  });

  it("shows Expiry Warning field in the embed", () => {
    expect(source).toContain("Expiry Warning");
  });

  it("shows 'Disabled' when notifyBeforeSec is 0", () => {
    expect(source).toContain("Disabled");
  });

  it("rejects notify-before that equals or exceeds session-duration with an error", () => {
    // Now validated and rejected rather than allowed with a caution note
    expect(source).toContain("must be less than the session duration");
  });

  it("calls isWatchtowerAdmin before making any changes", () => {
    expect(source).toContain("isWatchtowerAdmin");
  });

  it("does not use deprecated ephemeral: true", () => {
    expect(source).not.toContain("ephemeral: true");
  });

  it("does not call setDefaultMemberPermissions", () => {
    expect(source).not.toContain("setDefaultMemberPermissions");
  });
});

// ---------------------------------------------------------------------------
// Section 11: Warning scan eligibility logic (pure logic, no DB)
// ---------------------------------------------------------------------------

describe("Warning scan eligibility logic", () => {
  /**
   * The warning scan uses this condition:
   *   expiresAt <= now + notifyBeforeSec*1000
   *   AND expiresAt > now
   *   AND notifiedAt === null
   *   AND notifyBeforeSec > 0
   *
   * We test this logic directly as pure functions.
   * notifyBeforeSec is now stored and compared in seconds (not minutes).
   */

  function isInWarningWindow(
    expiresAt: Date,
    now: Date,
    notifyBeforeSec: number
  ): boolean {
    if (notifyBeforeSec <= 0) return false;
    const windowEnd = new Date(now.getTime() + notifyBeforeSec * 1000);
    return expiresAt <= windowEnd && expiresAt > now;
  }

  const NOW = new Date("2026-03-08T12:00:00Z");

  it("returns true when elevation expires exactly at window end", () => {
    const expiresAt = new Date(NOW.getTime() + 300 * 1000); // exactly 300s (5 min) from now
    expect(isInWarningWindow(expiresAt, NOW, 300)).toBe(true);
  });

  it("returns true when elevation expires within the window", () => {
    const expiresAt = new Date(NOW.getTime() + 180 * 1000); // 180s (3 min) from now
    expect(isInWarningWindow(expiresAt, NOW, 300)).toBe(true);
  });

  it("returns false when elevation expires outside the window", () => {
    const expiresAt = new Date(NOW.getTime() + 600 * 1000); // 600s (10 min) from now
    expect(isInWarningWindow(expiresAt, NOW, 300)).toBe(false);
  });

  it("returns false when elevation has already expired", () => {
    const expiresAt = new Date(NOW.getTime() - 60 * 1000); // 60s ago
    expect(isInWarningWindow(expiresAt, NOW, 300)).toBe(false);
  });

  it("returns false when notifyBeforeSec is 0 (disabled)", () => {
    const expiresAt = new Date(NOW.getTime() + 180 * 1000);
    expect(isInWarningWindow(expiresAt, NOW, 0)).toBe(false);
  });

  it("returns false when notifyBeforeSec is negative", () => {
    const expiresAt = new Date(NOW.getTime() + 180 * 1000);
    expect(isInWarningWindow(expiresAt, NOW, -1)).toBe(false);
  });

  it("fires immediately after elevation when notifyBeforeSec >= sessionDurationSec", () => {
    // If session is 300s (5 min) and warning window is 600s (10 min), elevation is already in window
    const expiresAt = new Date(NOW.getTime() + 300 * 1000); // 300s session
    expect(isInWarningWindow(expiresAt, NOW, 600)).toBe(true);
  });
});
