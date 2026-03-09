/**
 * QA Test Suite — v0.4.0 Features
 *
 * Covers all five features delivered in this sprint:
 *   1. Graceful Shutdown
 *   2. Rate Limiting on /elevate
 *   3. Bulk Eligibility Assignment (/watchtower-assign)
 *   4. /watchtower-list completeness (active elevations)
 *   5. /watchtower-audit command
 *
 * Strategy: structural source-text analysis (no running bot or DB required).
 * Complements the runtime tests in expiry-notifications.test.ts and others.
 * Pure logic is tested inline where extractable.
 */

import * as fs from "fs";
import * as path from "path";

// ---------------------------------------------------------------------------
// File path helpers
// ---------------------------------------------------------------------------
const ROOT = path.resolve(__dirname, "..");
const src = (...parts: string[]) => path.join(ROOT, "src", ...parts);
const read = (filePath: string): string => fs.readFileSync(filePath, "utf-8");

// ===========================================================================
// FEATURE 1 — Graceful Shutdown
// ===========================================================================

describe("Feature 1 — Graceful Shutdown: expireElevations.ts", () => {
  let source: string;
  beforeAll(() => { source = read(src("jobs", "expireElevations.ts")); });

  it("imports ScheduledTask from node-cron", () => {
    expect(source).toContain("ScheduledTask");
    expect(source).toContain("node-cron");
  });

  it("startExpiryJob returns ScheduledTask (not void)", () => {
    // Return type annotation must be ScheduledTask
    expect(source).toContain("startExpiryJob(client: Client): ScheduledTask");
  });

  it("cron.schedule result is stored in a named variable", () => {
    // Must capture the task to return it — not discard it
    expect(source).toMatch(/const task = cron\.schedule/);
  });

  it("returns the cron task at the end of startExpiryJob", () => {
    expect(source).toContain("return task");
  });

  it("does not return void (old signature must be gone)", () => {
    expect(source).not.toContain("startExpiryJob(client: Client): void");
  });
});

describe("Feature 1 — Graceful Shutdown: index.ts", () => {
  let source: string;
  beforeAll(() => { source = read(src("index.ts")); });

  it("imports ScheduledTask from node-cron", () => {
    expect(source).toContain("ScheduledTask");
    expect(source).toContain("node-cron");
  });

  it("defines a shutdown() async function", () => {
    expect(source).toContain("async function shutdown(");
  });

  it("shutdown accepts a signal string parameter", () => {
    expect(source).toMatch(/shutdown\(signal:\s*string/);
  });

  it("shutdown accepts a ScheduledTask or null parameter", () => {
    expect(source).toMatch(/ScheduledTask\s*\|\s*null/);
  });

  it("uses an isShuttingDown boolean guard against double-signal", () => {
    expect(source).toContain("isShuttingDown");
    expect(source).toContain("if (isShuttingDown) return");
  });

  it("registers SIGTERM handler", () => {
    expect(source).toContain(`"SIGTERM"`);
    expect(source).toContain("process.on(\"SIGTERM\"");
  });

  it("registers SIGINT handler", () => {
    expect(source).toContain(`"SIGINT"`);
    expect(source).toContain("process.on(\"SIGINT\"");
  });

  it("shutdown calls task.stop() when task is present", () => {
    expect(source).toContain("task.stop()");
  });

  it("task.stop() is inside a null-guard (if task)", () => {
    expect(source).toContain("if (task)");
  });

  it("shutdown calls db.$disconnect()", () => {
    expect(source).toContain("db.$disconnect()");
    expect(source).toContain("await db.$disconnect()");
  });

  it("shutdown calls client.destroy()", () => {
    expect(source).toContain("client.destroy()");
  });

  it("shutdown calls process.exit(0) on success", () => {
    expect(source).toContain("process.exit(0)");
  });

  it("shutdown calls process.exit(1) on error", () => {
    expect(source).toContain("process.exit(1)");
  });

  it("shutdown logs each step with [Shutdown] prefix", () => {
    expect(source).toContain("[Shutdown]");
  });

  it("stores the cron task returned by startExpiryJob", () => {
    expect(source).toMatch(/const task = startExpiryJob\(client\)/);
  });

  it("passes the stored task to both signal handlers", () => {
    // The handlers are registered on separate lines; check that both
    // process.on calls include 'task' somewhere after them.
    // We look for the pattern: process.on("SIGTERM" ... task) and ditto SIGINT.
    // Use indexOf to locate each handler line and then verify 'task' appears nearby.
    const sigtermLineIdx = source.indexOf(`process.on("SIGTERM"`);
    const sigintLineIdx  = source.indexOf(`process.on("SIGINT"`);
    expect(sigtermLineIdx).toBeGreaterThan(-1);
    expect(sigintLineIdx).toBeGreaterThan(-1);
    // Slice a reasonable window past each handler registration line to find 'task'
    const sigtermSnippet = source.slice(sigtermLineIdx, sigtermLineIdx + 80);
    const sigintSnippet  = source.slice(sigintLineIdx,  sigintLineIdx  + 80);
    expect(sigtermSnippet).toContain("task");
    expect(sigintSnippet).toContain("task");
  });

  it("handlers are registered after startExpiryJob (task variable is in scope)", () => {
    const taskAssignIdx = source.indexOf("const task = startExpiryJob");
    const sigtermIdx    = source.indexOf(`process.on("SIGTERM"`);
    expect(taskAssignIdx).toBeGreaterThan(-1);
    expect(sigtermIdx).toBeGreaterThan(taskAssignIdx);
  });

  it("does not use deprecated ephemeral: true syntax", () => {
    expect(source).not.toContain("ephemeral: true");
  });
});

// ===========================================================================
// FEATURE 2 — Rate Limiting on /elevate
// ===========================================================================

describe("Feature 2 — Rate Limiting: elevate.ts structural checks", () => {
  let source: string;
  beforeAll(() => { source = read(src("commands", "user", "elevate.ts")); });

  it("defines RATE_LIMIT_WINDOW_MS constant", () => {
    expect(source).toContain("RATE_LIMIT_WINDOW_MS");
  });

  it("defines RATE_LIMIT_MAX_ATTEMPTS constant", () => {
    expect(source).toContain("RATE_LIMIT_MAX_ATTEMPTS");
  });

  it("RATE_LIMIT_WINDOW_MS is set to 60_000 (60 seconds)", () => {
    expect(source).toMatch(/RATE_LIMIT_WINDOW_MS\s*=\s*60[_,]?000/);
  });

  it("RATE_LIMIT_MAX_ATTEMPTS is set to 3", () => {
    expect(source).toMatch(/RATE_LIMIT_MAX_ATTEMPTS\s*=\s*3/);
  });

  it("defines elevateCooldowns as a module-level Map", () => {
    expect(source).toContain("elevateCooldowns");
    expect(source).toContain("new Map<string, number[]>()");
  });

  it("defines isRateLimited function", () => {
    expect(source).toContain("function isRateLimited(");
  });

  it("isRateLimited filters by RATE_LIMIT_WINDOW_MS", () => {
    const fnStart = source.indexOf("function isRateLimited(");
    const fnEnd   = source.indexOf("\nexport const data");
    const fnText  = source.slice(fnStart, fnEnd);
    expect(fnText).toContain("RATE_LIMIT_WINDOW_MS");
  });

  it("isRateLimited compares against RATE_LIMIT_MAX_ATTEMPTS", () => {
    const fnStart = source.indexOf("function isRateLimited(");
    const fnEnd   = source.indexOf("\nexport const data");
    const fnText  = source.slice(fnStart, fnEnd);
    expect(fnText).toContain("RATE_LIMIT_MAX_ATTEMPTS");
  });

  it("rate-limit check is called inside execute()", () => {
    const execStart = source.indexOf("export async function execute(");
    const execText  = source.slice(execStart);
    expect(execText).toContain("isRateLimited(");
  });

  it("rate-limit key is scoped to guildId + userId (multi-guild isolation)", () => {
    const execStart = source.indexOf("export async function execute(");
    const execText  = source.slice(execStart);
    // Key must incorporate both guildId and discordUserId / user.id
    expect(execText).toMatch(/guildId.*discordUserId|discordUserId.*guildId/);
    expect(execText).toContain("rlKey");
  });

  it("rate-limit check happens after deferReply but before any DB access", () => {
    const execStart   = source.indexOf("export async function execute(");
    const execText    = source.slice(execStart);
    const deferIdx    = execText.indexOf("deferReply");
    const rlIdx       = execText.indexOf("isRateLimited");
    const dbIdx       = execText.indexOf("db.pimUser.findUnique");
    expect(deferIdx).toBeGreaterThan(-1);
    expect(rlIdx).toBeGreaterThan(deferIdx);
    expect(rlIdx).toBeLessThan(dbIdx);
  });

  it("rate-limit rejection returns an ephemeral reply without touching the DB", () => {
    expect(source).toContain("sending commands too quickly");
    // The reply must come right after the rate-limit check, before any db. call
    const rlIdx    = source.indexOf("isRateLimited");
    const replyIdx = source.indexOf("sending commands too quickly");
    const dbIdx    = source.indexOf("db.pimUser.findUnique");
    expect(replyIdx).toBeGreaterThan(rlIdx);
    expect(replyIdx).toBeLessThan(dbIdx);
  });

  it("does not write an audit log entry for rate-limited requests", () => {
    // The writeAuditLog call for FAILED_ATTEMPT must be after the rate-limit block
    const rlIdx       = source.indexOf("sending commands too quickly");
    const auditIdx    = source.indexOf("FAILED_ATTEMPT");
    expect(auditIdx).toBeGreaterThan(rlIdx);
  });

  it("does not expose the window or threshold in the user-facing message", () => {
    const msg = "You are sending commands too quickly. Please wait a moment before trying again.";
    expect(source).toContain(msg);
    // Message must not contain the raw numbers
    const msgStart = source.indexOf(msg);
    const msgSnippet = source.slice(msgStart, msgStart + msg.length);
    expect(msgSnippet).not.toContain("60");
    expect(msgSnippet).not.toContain("3");
  });
});

// Pure logic test — rate limiter behaviour extracted from source
describe("Feature 2 — Rate Limiting: isRateLimited pure logic", () => {
  const WINDOW_MS = 60_000;
  const MAX      = 3;

  // Each test gets a fresh Map so state never leaks between cases.
  let cooldowns: Map<string, number[]>;
  function isRateLimited(key: string, now: number): boolean {
    const recent = (cooldowns.get(key) ?? []).filter(ts => now - ts < WINDOW_MS);
    if (recent.length >= MAX) {
      cooldowns.set(key, recent);
      return true;
    }
    recent.push(now);
    cooldowns.set(key, recent);
    return false;
  }

  beforeEach(() => { cooldowns = new Map(); });

  it("allows first 3 attempts within 60s", () => {
    const t = Date.now();
    expect(isRateLimited("g:u", t)).toBe(false);
    expect(isRateLimited("g:u", t + 1000)).toBe(false);
    expect(isRateLimited("g:u", t + 2000)).toBe(false);
  });

  it("blocks the 4th attempt within 60s", () => {
    const t = Date.now();
    isRateLimited("g:u", t);
    isRateLimited("g:u", t + 1000);
    isRateLimited("g:u", t + 2000);
    expect(isRateLimited("g:u", t + 3000)).toBe(true);
  });

  it("allows a new attempt after the window expires", () => {
    const t = Date.now();
    isRateLimited("g:u", t);
    isRateLimited("g:u", t + 1000);
    isRateLimited("g:u", t + 2000);
    // 4th attempt is blocked
    expect(isRateLimited("g:u", t + 3000)).toBe(true);
    // But 61s after the first attempt, the window has slid past it
    expect(isRateLimited("g:u", t + WINDOW_MS + 1000)).toBe(false);
  });

  it("different guild:user keys are tracked independently", () => {
    const t = Date.now();
    isRateLimited("guild1:user1", t);
    isRateLimited("guild1:user1", t + 1000);
    isRateLimited("guild1:user1", t + 2000);
    // user1 in guild1 is limited, but user2 in guild1 is not
    expect(isRateLimited("guild1:user1", t + 3000)).toBe(true);
    expect(isRateLimited("guild1:user2", t + 3000)).toBe(false);
  });

  it("same user in different guilds is tracked independently", () => {
    const t = Date.now();
    isRateLimited("guild1:user1", t);
    isRateLimited("guild1:user1", t + 1000);
    isRateLimited("guild1:user1", t + 2000);
    // Limited in guild1 but not in guild2
    expect(isRateLimited("guild1:user1", t + 3000)).toBe(true);
    expect(isRateLimited("guild2:user1", t + 3000)).toBe(false);
  });

  it("stale entries outside the window are pruned and do not count", () => {
    const t = Date.now();
    // 3 old attempts, all older than WINDOW_MS
    isRateLimited("g:u", t - WINDOW_MS - 3000);
    isRateLimited("g:u", t - WINDOW_MS - 2000);
    isRateLimited("g:u", t - WINDOW_MS - 1000);
    // All three are stale; new attempt should be allowed
    expect(isRateLimited("g:u", t)).toBe(false);
  });

  it("entry just inside the window boundary still counts toward the limit", () => {
    // All three entries must still be within WINDOW_MS of the check time (t + 3000).
    // Entry ages at check time: 2999ms, 2000ms, 1000ms — all < WINDOW_MS.
    const t = Date.now();
    isRateLimited("g:u", t + 1);      // age at check: ~2999ms
    isRateLimited("g:u", t + 1000);   // age at check: ~2000ms
    isRateLimited("g:u", t + 2000);   // age at check: ~1000ms
    // 4th attempt: all three prior entries are still within window → blocked
    expect(isRateLimited("g:u", t + 3000)).toBe(true);
  });
});

// ===========================================================================
// FEATURE 3 — Bulk Eligibility Assignment
// ===========================================================================

describe("Feature 3 — Bulk Assignment: assign.ts structural checks", () => {
  let source: string;
  beforeAll(() => { source = read(src("commands", "admin", "assign.ts")); });

  it("command is named watchtower-assign", () => {
    expect(source).toContain('"watchtower-assign"');
  });

  it("defines role1 option as required", () => {
    expect(source).toContain('"role1"');
    expect(source).toMatch(/setName\("role1"\)[^;]+setRequired\(true\)/s);
  });

  it("defines role2 option as optional (not required)", () => {
    expect(source).toContain('"role2"');
    expect(source).toMatch(/setName\("role2"\)[^;]+setRequired\(false\)/s);
  });

  it("defines role3 option as optional (not required)", () => {
    expect(source).toContain('"role3"');
    expect(source).toMatch(/setName\("role3"\)[^;]+setRequired\(false\)/s);
  });

  it("old single 'role' option has been removed", () => {
    // Only the string 'role1', 'role2', 'role3' should appear; not the bare '"role"' option
    // (We check the builder section specifically, not the word 'role' everywhere)
    expect(source).not.toMatch(/setName\("role"\)/);
  });

  it("defines a processRole helper function", () => {
    expect(source).toContain("async function processRole(");
  });

  it("processRole accepts a GuildMember botMember parameter", () => {
    expect(source).toContain("botMember: GuildMember");
  });

  it("processRole returns a typed RoleOutcome", () => {
    expect(source).toContain("RoleOutcome");
  });

  it("RoleOutcome type covers assigned, already_assigned, and skipped statuses", () => {
    expect(source).toContain('"assigned"');
    expect(source).toContain('"already_assigned"');
    expect(source).toContain('"skipped"');
  });

  it("uses findUnique before upsert to detect existing assignments (idempotency)", () => {
    expect(source).toContain("eligibleRole.findUnique");
    expect(source).toContain("eligibleRole.upsert");
    // findUnique must precede upsert in processRole
    const fnStart    = source.indexOf("async function processRole(");
    const fnEnd      = source.indexOf("\nfunction outcomeLabel");
    const fnText     = source.slice(fnStart, fnEnd);
    const findIdx    = fnText.indexOf("eligibleRole.findUnique");
    const upsertIdx  = fnText.indexOf("eligibleRole.upsert");
    expect(findIdx).toBeLessThan(upsertIdx);
  });

  it("audit log is only written for newly assigned roles (not already_assigned)", () => {
    const fnStart  = source.indexOf("async function processRole(");
    const fnEnd    = source.indexOf("\nfunction outcomeLabel");
    const fnText   = source.slice(fnStart, fnEnd);
    // ELIGIBILITY_GRANTED must appear after the 'if (existing)' return for already_assigned
    const existingReturnIdx = fnText.indexOf('{ status: "already_assigned"');
    const auditIdx          = fnText.indexOf("ELIGIBILITY_GRANTED");
    expect(existingReturnIdx).toBeGreaterThan(-1);
    expect(auditIdx).toBeGreaterThan(existingReturnIdx);
  });

  it("admin role guard is enforced inside processRole", () => {
    const fnStart = source.indexOf("async function processRole(");
    const fnEnd   = source.indexOf("\nfunction outcomeLabel");
    const fnText  = source.slice(fnStart, fnEnd);
    expect(fnText).toContain("config.adminRoleId && role.id === config.adminRoleId");
  });

  it("hierarchy check is enforced inside processRole", () => {
    const fnStart = source.indexOf("async function processRole(");
    const fnEnd   = source.indexOf("\nfunction outcomeLabel");
    const fnText  = source.slice(fnStart, fnEnd);
    expect(fnText).toContain("role.position >= botMember.roles.highest.position");
  });

  it("guild and botMember are fetched once before the role loop", () => {
    const execStart  = source.indexOf("export async function execute(");
    const execText   = source.slice(execStart);
    const guildFetch = execText.indexOf("client.guilds.fetch");
    const loopIdx    = execText.indexOf("for (const role of uniqueRoles)");
    expect(guildFetch).toBeGreaterThan(-1);
    expect(loopIdx).toBeGreaterThan(guildFetch);
  });

  it("deduplicates roles by ID before processing", () => {
    expect(source).toContain("new Map(rawRoles.map((r) => [r.id, r]))");
  });

  it("filters null role options before deduplication", () => {
    expect(source).toContain(".filter(");
    expect(source).toContain("r !== null");
  });

  it("calls isWatchtowerAdmin immediately after deferReply", () => {
    const execStart    = source.indexOf("export async function execute(");
    const execText     = source.slice(execStart);
    const deferIdx     = execText.indexOf("deferReply");
    const adminCheckIdx = execText.indexOf("isWatchtowerAdmin");
    expect(deferIdx).toBeGreaterThan(-1);
    expect(adminCheckIdx).toBeGreaterThan(deferIdx);
    // And the pimUser fetch must come after the admin check
    const pimFetchIdx  = execText.indexOf("db.pimUser.findUnique");
    expect(pimFetchIdx).toBeGreaterThan(adminCheckIdx);
  });

  it("reply text distinguishes between newly assigned and already assigned roles", () => {
    expect(source).toContain("assigned");
    expect(source).toContain("already assigned (no change)");
  });

  it("reply text describes skipped roles with a reason", () => {
    expect(source).toContain("skipped:");
  });

  it("does not use deprecated ephemeral: true", () => {
    expect(source).not.toContain("ephemeral: true");
  });

  it("includes isWatchtowerAdmin: true in audit metadata", () => {
    expect(source).toContain("isWatchtowerAdmin: true");
  });
});

// ===========================================================================
// FEATURE 4 — /watchtower-list Completeness
// ===========================================================================

describe("Feature 4 — List completeness: list.ts structural checks", () => {
  let source: string;
  beforeAll(() => { source = read(src("commands", "admin", "list.ts")); });

  it("queries activeElevation table", () => {
    expect(source).toContain("db.activeElevation.findMany");
  });

  it("active elevation query is ordered by expiresAt ascending (soonest first)", () => {
    const queryStart = source.indexOf("db.activeElevation.findMany");
    const queryEnd   = source.indexOf(");", queryStart);
    const queryText  = source.slice(queryStart, queryEnd);
    expect(queryText).toContain("expiresAt");
    expect(queryText).toContain('"asc"');
  });

  it("active elevation query is scoped by guildId", () => {
    // guildId is injected via the baseWhere variable shared by both queries.
    // Check from where baseWhere is defined through the end of the findMany call.
    const whereDefIdx = source.indexOf("baseWhere");
    const queryEnd    = source.indexOf(");", source.indexOf("db.activeElevation.findMany"));
    const queryText   = source.slice(whereDefIdx, queryEnd);
    expect(queryText).toContain("guildId");
  });

  it("active elevation query includes pimUser relation", () => {
    const queryStart = source.indexOf("db.activeElevation.findMany");
    const queryEnd   = source.indexOf(");", queryStart);
    const queryText  = source.slice(queryStart, queryEnd);
    expect(queryText).toContain("include");
    expect(queryText).toContain("pimUser");
  });

  it("defines MAX_ASSIGNMENT_FIELDS constant", () => {
    expect(source).toContain("MAX_ASSIGNMENT_FIELDS");
  });

  it("defines MAX_ELEVATION_FIELDS constant", () => {
    expect(source).toContain("MAX_ELEVATION_FIELDS");
  });

  it("MAX_ASSIGNMENT_FIELDS is 20 (within 25-field Discord cap)", () => {
    expect(source).toMatch(/MAX_ASSIGNMENT_FIELDS\s*=\s*20/);
  });

  it("MAX_ELEVATION_FIELDS is 5 (within 25-field Discord cap)", () => {
    expect(source).toMatch(/MAX_ELEVATION_FIELDS\s*=\s*5/);
  });

  it("total field budget does not exceed Discord's 25-field limit (20 + 5 = 25)", () => {
    const assignMatch  = source.match(/MAX_ASSIGNMENT_FIELDS\s*=\s*(\d+)/);
    const elevMatch    = source.match(/MAX_ELEVATION_FIELDS\s*=\s*(\d+)/);
    const assignMax    = assignMatch ? parseInt(assignMatch[1], 10) : Infinity;
    const elevMax      = elevMatch   ? parseInt(elevMatch[1],   10) : Infinity;
    expect(assignMax + elevMax).toBeLessThanOrEqual(25);
  });

  it("renders active elevations with a relative Discord timestamp (:R)", () => {
    expect(source).toContain(":R>");
  });

  it("shows 'None currently active.' when there are no active elevations", () => {
    expect(source).toContain("None currently active.");
  });

  it("shows empty state plain reply when both queries return zero results", () => {
    expect(source).toContain("No PIM access records found.");
  });

  it("embed title changes based on whether a user filter is applied", () => {
    expect(source).toContain("PIM Access Overview");
    expect(source).toContain("PIM Access —");
  });

  it("active elevations section label is present in embed", () => {
    expect(source).toContain("Active Elevations");
  });

  it("includes footer truncation note when results exceed field limits", () => {
    expect(source).toContain("Showing");
    expect(source).toContain("assignments");
    expect(source).toContain("active elevations");
  });

  it("user filter applies to both eligible roles and active elevations queries", () => {
    // SF-3: both queries share a single baseWhere variable that contains guildId.
    // Verify baseWhere is defined and referenced by both findMany calls.
    const baseWhereIdx = source.indexOf("baseWhere");
    expect(baseWhereIdx).toBeGreaterThan(-1);
    // Both findMany calls should reference baseWhere
    const eligibleFindStart = source.indexOf("db.eligibleRole.findMany");
    const elevFindStart     = source.indexOf("db.activeElevation.findMany");
    const eligibleFindText  = source.slice(eligibleFindStart, source.indexOf(");", eligibleFindStart));
    const elevFindText      = source.slice(elevFindStart,     source.indexOf(");", elevFindStart));
    expect(eligibleFindText).toContain("baseWhere");
    expect(elevFindText).toContain("baseWhere");
    // And baseWhere itself contains guildId
    const baseWhereText = source.slice(baseWhereIdx, source.indexOf("\n\n", baseWhereIdx));
    expect(baseWhereText).toContain("guildId");
  });

  it("calls isWatchtowerAdmin", () => {
    expect(source).toContain("isWatchtowerAdmin");
  });

  it("does not use deprecated ephemeral: true", () => {
    expect(source).not.toContain("ephemeral: true");
  });
});

// ===========================================================================
// FEATURE 5 — /watchtower-audit Command
// ===========================================================================

describe("Feature 5 — Audit command: audit.ts structural checks", () => {
  let source: string;
  beforeAll(() => { source = read(src("commands", "admin", "audit.ts")); });

  it("command is named watchtower-audit", () => {
    expect(source).toContain('"watchtower-audit"');
  });

  it("defines a 'user' subcommand", () => {
    expect(source).toContain('"user"');
    expect(source).toContain("addSubcommand");
  });

  it("defines a 'recent' subcommand", () => {
    expect(source).toContain('"recent"');
  });

  it("user subcommand has a required 'user' option", () => {
    expect(source).toContain("addUserOption");
    expect(source).toContain("setRequired(true)");
  });

  it("both subcommands have a limit integer option (1–25)", () => {
    expect(source).toContain("setMinValue(1)");
    expect(source).toContain("setMaxValue(25)");
  });

  it("does NOT call setDefaultMemberPermissions (isWatchtowerAdmin is the sole gate)", () => {
    expect(source).not.toContain("setDefaultMemberPermissions");
  });

  it("calls isWatchtowerAdmin immediately after deferReply", () => {
    const execStart    = source.indexOf("export async function execute(");
    const execText     = source.slice(execStart);
    const deferIdx     = execText.indexOf("deferReply");
    const adminCheckIdx = execText.indexOf("isWatchtowerAdmin");
    expect(deferIdx).toBeGreaterThan(-1);
    expect(adminCheckIdx).toBeGreaterThan(deferIdx);
  });

  it("imports isWatchtowerAdmin from lib/permissions", () => {
    expect(source).toContain("isWatchtowerAdmin");
    expect(source).toContain("permissions");
  });

  it("imports getOrCreateGuildConfig", () => {
    expect(source).toContain("getOrCreateGuildConfig");
  });

  it("imports eventTypeEmoji from lib/audit", () => {
    expect(source).toContain("eventTypeEmoji");
    expect(source).toContain("lib/audit");
  });

  it("user subcommand queries by guildId AND discordUserId", () => {
    const subStart = source.indexOf('"user"');
    const dbIdx    = source.indexOf("db.auditLog.findMany", subStart);
    const dbText   = source.slice(dbIdx, dbIdx + 300);
    expect(dbText).toContain("guildId");
    expect(dbText).toContain("discordUserId");
  });

  it("recent subcommand queries by guildId only", () => {
    const subStart = source.indexOf('"recent"');
    const dbIdx    = source.indexOf("db.auditLog.findMany", subStart);
    const dbText   = source.slice(dbIdx, dbIdx + 200);
    expect(dbText).toContain("guildId");
  });

  it("both queries order by createdAt descending", () => {
    const occurrences = (source.match(/createdAt.*desc/g) ?? []).length;
    expect(occurrences).toBeGreaterThanOrEqual(2);
  });

  it("queries use 'take' to limit results", () => {
    const takeOccurrences = (source.match(/\btake\b/g) ?? []).length;
    expect(takeOccurrences).toBeGreaterThanOrEqual(2);
  });

  it("defines DEFAULT_LIMIT constant", () => {
    expect(source).toContain("DEFAULT_LIMIT");
  });

  it("DEFAULT_LIMIT is 10", () => {
    expect(source).toMatch(/DEFAULT_LIMIT\s*=\s*10/);
  });

  it("defines buildAuditEmbed helper function", () => {
    expect(source).toContain("function buildAuditEmbed(");
  });

  it("buildAuditEmbed enforces an EMBED_CHAR_BUDGET", () => {
    expect(source).toContain("EMBED_CHAR_BUDGET");
  });

  it("EMBED_CHAR_BUDGET is set conservatively (≤6000)", () => {
    const match = source.match(/EMBED_CHAR_BUDGET\s*=\s*(\d+)/);
    expect(match).not.toBeNull();
    const budget = parseInt(match![1], 10);
    expect(budget).toBeLessThanOrEqual(6000);
    expect(budget).toBeGreaterThan(0);
  });

  it("buildAuditEmbed includes a footer when entries are truncated", () => {
    expect(source).toContain("truncated to fit Discord limits");
  });

  it("uses eventTypeEmoji to prefix each audit entry field name", () => {
    const buildFnStart = source.indexOf("function buildAuditEmbed(");
    const buildFnText  = source.slice(buildFnStart, buildFnStart + 600);
    expect(buildFnText).toContain("eventTypeEmoji");
  });

  it("renders roleName conditionally (only if present on log entry)", () => {
    expect(source).toContain("log.roleName");
    // Must use conditional — roleName is nullable
    expect(source).toMatch(/log\.roleName\s*\?/);
  });

  it("does not render metadata JSON (avoids accidental sensitive data exposure)", () => {
    const buildFnStart = source.indexOf("function buildAuditEmbed(");
    const buildFnEnd   = source.indexOf("\n// -----------", buildFnStart);
    const buildFnText  = source.slice(buildFnStart, buildFnEnd);
    expect(buildFnText).not.toContain("log.metadata");
  });

  it("handles zero results with a plain text reply (no embed)", () => {
    expect(source).toContain("No audit log entries found");
  });

  it("uses deferReply with MessageFlags.Ephemeral", () => {
    expect(source).toContain("deferReply");
    expect(source).toContain("MessageFlags.Ephemeral");
  });

  it("does not use deprecated ephemeral: true", () => {
    expect(source).not.toContain("ephemeral: true");
  });

  it("handles unknown subcommand gracefully (unreachable fallback)", () => {
    expect(source).toContain("Unknown subcommand");
  });
});

describe("Feature 5 — Audit command: buildAuditEmbed logic", () => {
  /**
   * We test the embed-building logic inline since the function itself
   * is internal to the module and not exported. We replicate its core
   * truncation logic here to verify the budget check works correctly.
   */

  const BUDGET = 5500;

  interface FakeLog {
    eventType: string;
    discordUserId: string;
    roleName: string | null;
    createdAt: Date;
  }

  function simulateBuildEmbed(logs: FakeLog[]): { shown: number; total: number } {
    let charCount = "Audit Log — Recent (last 10)".length;
    let shown = 0;
    for (const log of logs) {
      const fieldName  = `📋 ${log.eventType}`;
      const rolePart   = log.roleName ? ` | Role: **${log.roleName}**` : "";
      const fieldValue = `<@${log.discordUserId}> | <t:${Math.floor(log.createdAt.getTime() / 1000)}:R>${rolePart}`;
      if (charCount + fieldName.length + fieldValue.length > BUDGET) break;
      charCount += fieldName.length + fieldValue.length;
      shown++;
    }
    return { shown, total: logs.length };
  }

  function makeLogs(count: number): FakeLog[] {
    return Array.from({ length: count }, (_, i) => ({
      eventType: "ELEVATION_GRANTED",
      discordUserId: "123456789012345678",
      roleName: i % 2 === 0 ? "AdminRole" : null,
      createdAt: new Date(),
    }));
  }

  it("shows all entries when well within the budget", () => {
    const { shown, total } = simulateBuildEmbed(makeLogs(5));
    expect(shown).toBe(total);
  });

  it("truncates when the budget would be exceeded by many long entries", () => {
    // 25 entries with a long roleName will exceed the budget
    const longLogs: FakeLog[] = Array.from({ length: 25 }, () => ({
      eventType: "ELIGIBILITY_GRANTED",
      discordUserId: "999999999999999999",
      roleName: "A".repeat(200),
      createdAt: new Date(),
    }));
    const { shown, total } = simulateBuildEmbed(longLogs);
    expect(shown).toBeLessThan(total);
  });

  it("shows 0 entries if even the first entry exceeds the budget", () => {
    const hugeLog: FakeLog[] = [{
      eventType: "X".repeat(3000),
      discordUserId: "123",
      roleName: "Y".repeat(3000),
      createdAt: new Date(),
    }];
    const { shown } = simulateBuildEmbed(hugeLog);
    expect(shown).toBe(0);
  });
});

// ===========================================================================
// FEATURE 5 — audit.ts: eventTypeEmoji export
// ===========================================================================

describe("Feature 5 — audit.ts: eventTypeEmoji is exported", () => {
  let source: string;
  beforeAll(() => { source = read(src("lib", "audit.ts")); });

  it("eventTypeEmoji is exported (not private)", () => {
    expect(source).toContain("export function eventTypeEmoji");
  });

  it("eventTypeEmoji is not a default export (named export only)", () => {
    expect(source).not.toContain("export default eventTypeEmoji");
  });
});

// ===========================================================================
// CROSS-CUTTING: help.ts updated for new command and changed commands
// ===========================================================================

describe("Cross-cutting — help.ts updated for v0.4.0", () => {
  let source: string;
  beforeAll(() => { source = read(src("commands", "user", "help.ts")); });

  it("mentions /watchtower-audit in the admin section", () => {
    expect(source).toContain("/watchtower-audit");
  });

  it("describes both subcommands of /watchtower-audit", () => {
    expect(source).toContain("user:@User");
    expect(source).toContain("recent:N");
  });

  it("watchtower-assign description mentions up to 3 roles", () => {
    // The first occurrence is in "Getting Started"; the Admin Commands field
    // (second occurrence) has the updated description with "3 roles at once".
    const firstIdx  = source.indexOf("/watchtower-assign");
    const secondIdx = source.indexOf("/watchtower-assign", firstIdx + 1);
    expect(secondIdx).toBeGreaterThan(-1);
    const snippet = source.slice(secondIdx, secondIdx + 120);
    expect(snippet).toContain("3 role");
  });

  it("watchtower-list description mentions active elevations", () => {
    const idx = source.indexOf("/watchtower-list");
    const snippet = source.slice(idx, idx + 120);
    expect(snippet.toLowerCase()).toContain("elevation");
  });
});

// ===========================================================================
// CROSS-CUTTING: admin-guard — new audit command obeys the guard
// ===========================================================================

describe("Cross-cutting — watchtower-audit follows admin command conventions", () => {
  let source: string;
  beforeAll(() => { source = read(src("commands", "admin", "audit.ts")); });

  it("imports GuildMember for the cast", () => {
    expect(source).toContain("GuildMember");
  });

  it("casts interaction.member as GuildMember", () => {
    expect(source).toContain("interaction.member as GuildMember");
  });

  it("uses getOrCreateGuildConfig to load config", () => {
    expect(source).toContain("getOrCreateGuildConfig");
  });

  it("returns the permission-denied message when guard fails", () => {
    expect(source).toContain("You do not have permission to use this command.");
  });

  it("uses MessageFlags.Ephemeral (not deprecated ephemeral: true)", () => {
    expect(source).toContain("MessageFlags.Ephemeral");
    expect(source).not.toContain("ephemeral: true");
  });
});
