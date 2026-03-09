/**
 * Unit tests for src/lib/duration.ts
 *
 * Pure unit tests — no DB, no Discord API. Each test focuses on a single
 * parsing or formatting behaviour.
 */

import { parseDuration, formatDuration } from "../src/lib/duration";

// ---------------------------------------------------------------------------
// parseDuration
// ---------------------------------------------------------------------------

describe("parseDuration — valid inputs", () => {
  it("parses seconds suffix", () => {
    expect(parseDuration("90s")).toBe(90);
  });

  it("parses minutes suffix", () => {
    expect(parseDuration("30m")).toBe(1800);
  });

  it("parses hours suffix", () => {
    expect(parseDuration("2h")).toBe(7200);
  });

  it("parses days suffix", () => {
    expect(parseDuration("1d")).toBe(86400);
  });

  it("parses uppercase suffix (case insensitive)", () => {
    expect(parseDuration("2H")).toBe(7200);
    expect(parseDuration("30M")).toBe(1800);
    expect(parseDuration("1D")).toBe(86400);
  });

  it("parses the bare string '0' as 0 (disable)", () => {
    expect(parseDuration("0")).toBe(0);
  });

  it("trims leading/trailing whitespace", () => {
    expect(parseDuration("  60s  ")).toBe(60);
    expect(parseDuration(" 2h ")).toBe(7200);
  });

  it("parses 60m as 3600", () => {
    expect(parseDuration("60m")).toBe(3600);
  });

  it("parses 24h as 86400", () => {
    expect(parseDuration("24h")).toBe(86400);
  });

  it("parses 1s as 1", () => {
    expect(parseDuration("1s")).toBe(1);
  });

  it("parses multi-digit values", () => {
    expect(parseDuration("120s")).toBe(120);
    expect(parseDuration("180m")).toBe(10800);
  });
});

describe("parseDuration — invalid inputs", () => {
  it("returns null for empty string", () => {
    expect(parseDuration("")).toBeNull();
  });

  it("treats bare integer as minutes", () => {
    expect(parseDuration("30")).toBe(1800);
    expect(parseDuration("60")).toBe(3600);
    expect(parseDuration("120")).toBe(7200);
    expect(parseDuration("1")).toBe(60);
  });

  it("returns null for unknown unit suffix", () => {
    expect(parseDuration("2w")).toBeNull();
    expect(parseDuration("5y")).toBeNull();
  });

  it("returns null for compound duration strings", () => {
    expect(parseDuration("1h30m")).toBeNull();
    expect(parseDuration("2h 30m")).toBeNull();
  });

  it("returns null for non-integer seconds result (fractional minutes)", () => {
    // 1.5m = 90s is actually an integer — this one should parse fine
    // But 0.1s = 0.1 which is not an integer
    expect(parseDuration("0.1s")).toBeNull();
  });

  it("returns null for negative values", () => {
    expect(parseDuration("-1h")).toBeNull();
    expect(parseDuration("-30m")).toBeNull();
  });

  it("returns null for plain text", () => {
    expect(parseDuration("two hours")).toBeNull();
    expect(parseDuration("invalid")).toBeNull();
  });

  it("returns null for unit-only string (no number)", () => {
    expect(parseDuration("h")).toBeNull();
    expect(parseDuration("m")).toBeNull();
  });

  it("returns null for number with trailing characters after unit", () => {
    expect(parseDuration("2h extra")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// formatDuration
// ---------------------------------------------------------------------------

describe("formatDuration — whole unit values", () => {
  it("formats 0 as 'disabled'", () => {
    expect(formatDuration(0)).toBe("disabled");
  });

  it("formats seconds-only duration", () => {
    expect(formatDuration(30)).toBe("30s");
    expect(formatDuration(1)).toBe("1s");
    expect(formatDuration(59)).toBe("59s");
  });

  it("formats exact minutes with no remainder", () => {
    expect(formatDuration(60)).toBe("1m");
    expect(formatDuration(1800)).toBe("30m");
    expect(formatDuration(3540)).toBe("59m");
  });

  it("formats exact hours with no remainder", () => {
    expect(formatDuration(3600)).toBe("1h");
    expect(formatDuration(7200)).toBe("2h");
  });

  it("formats exact days with no remainder", () => {
    expect(formatDuration(86400)).toBe("1d");
    expect(formatDuration(172800)).toBe("2d");
  });
});

describe("formatDuration — compound values", () => {
  it("formats minutes + seconds remainder", () => {
    expect(formatDuration(90)).toBe("1m 30s");
    expect(formatDuration(61)).toBe("1m 1s");
  });

  it("formats hours + minutes remainder", () => {
    expect(formatDuration(5400)).toBe("1h 30m");
    expect(formatDuration(3660)).toBe("1h 1m");
  });

  it("formats days + hours remainder", () => {
    expect(formatDuration(90000)).toBe("1d 1h");
    expect(formatDuration(93600)).toBe("1d 2h");
  });

  it("ignores seconds when hours are present (shows h + m only)", () => {
    // 3661 = 1h 1m 1s — formatted as "1h 1m" (seconds dropped at hour scale)
    expect(formatDuration(3661)).toBe("1h 1m");
  });

  it("ignores minutes when days are present (shows d + h only)", () => {
    // 86460 = 1d 0h 1m — formatted as "1d" (no hour remainder)
    expect(formatDuration(86460)).toBe("1d");
  });

  it("ignores hour remainder when days + hours is displayed", () => {
    // 90060 = 1d 1h 1m — formatted as "1d 1h" (minutes dropped at day scale)
    expect(formatDuration(90060)).toBe("1d 1h");
  });
});

describe("formatDuration — common config values", () => {
  it("formats default session duration (3600s = 1h)", () => {
    expect(formatDuration(3600)).toBe("1h");
  });

  it("formats default notify-before (300s = 5m)", () => {
    expect(formatDuration(300)).toBe("5m");
  });

  it("formats max session duration (86400s = 1d)", () => {
    expect(formatDuration(86400)).toBe("1d");
  });
});

// ---------------------------------------------------------------------------
// Round-trip: parseDuration → formatDuration identity checks
// ---------------------------------------------------------------------------

describe("parseDuration + formatDuration round-trip", () => {
  const cases: Array<[string, number, string]> = [
    ["30s", 30, "30s"],
    ["5m", 300, "5m"],
    ["2h", 7200, "2h"],
    ["1d", 86400, "1d"],
    ["0", 0, "disabled"],
  ];

  it.each(cases)(
    "parseDuration('%s') === %d and formatDuration(%d) === '%s'",
    (input, expectedSeconds, expectedFormatted) => {
      const parsed = parseDuration(input);
      expect(parsed).toBe(expectedSeconds);
      if (parsed !== null) {
        expect(formatDuration(parsed)).toBe(expectedFormatted);
      }
    }
  );
});
