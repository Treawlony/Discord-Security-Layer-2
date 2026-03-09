/**
 * Duration parsing and formatting utilities.
 *
 * All durations are represented in seconds internally. The user-facing format
 * is a number followed by a unit suffix: "s" (seconds), "m" (minutes), "h"
 * (hours), or "d" (days). A bare number with no suffix is assumed to be
 * minutes. The special string "0" disables a feature (e.g. notify-before).
 *
 * Single-unit input only — compound strings like "1h30m" are not supported.
 */

const UNIT_TO_SECONDS: Record<string, number> = {
  s: 1,
  m: 60,
  h: 3600,
  d: 86400,
};

/**
 * Parse a human-readable duration string into a number of seconds.
 *
 * Accepted formats:
 *   "30"   → 1800  (bare number — assumed to be minutes)
 *   "30s"  → 30
 *   "30m"  → 1800
 *   "2h"   → 7200
 *   "1d"   → 86400
 *   "0"    → 0  (special case: disable)
 *
 * Returns null for any input that does not match these patterns.
 */
export function parseDuration(input: string): number | null {
  const trimmed = input.trim();

  // Special case: bare "0" means "disabled" (e.g. for notify-before)
  if (trimmed === "0") {
    return 0;
  }

  // Bare number with no unit suffix — treated as minutes
  if (/^\d+(?:\.\d+)?$/.test(trimmed)) {
    const seconds = parseFloat(trimmed) * 60;
    if (!isFinite(seconds) || seconds < 0 || !Number.isInteger(seconds)) {
      return null;
    }
    return seconds;
  }

  const match = trimmed.match(/^(\d+(?:\.\d+)?)(s|m|h|d)$/i);
  if (!match) {
    return null;
  }

  const value = parseFloat(match[1]);
  const unit = match[2].toLowerCase();
  const multiplier = UNIT_TO_SECONDS[unit];

  if (multiplier === undefined) {
    return null;
  }

  const seconds = value * multiplier;

  // Must be a non-negative finite integer number of seconds
  if (!isFinite(seconds) || seconds < 0 || !Number.isInteger(seconds)) {
    return null;
  }

  return seconds;
}

/**
 * Format a duration in seconds into a human-readable string.
 *
 * Rules:
 *   0           → "disabled"
 *   < 60        → "Xs"        e.g. "30s"
 *   < 3600      → "Xm [Ys]"  e.g. "1m 30s" (remainder only shown if non-zero)
 *   < 86400     → "Xh [Ym]"  e.g. "2h", "1h 30m"
 *   >= 86400    → "Xd [Yh]"  e.g. "1d", "1d 2h"
 */
export function formatDuration(seconds: number): string {
  if (seconds === 0) {
    return "disabled";
  }

  const days = Math.floor(seconds / 86400);
  const remainderAfterDays = seconds % 86400;
  const hours = Math.floor(remainderAfterDays / 3600);
  const remainderAfterHours = remainderAfterDays % 3600;
  const minutes = Math.floor(remainderAfterHours / 60);
  const secs = remainderAfterHours % 60;

  if (days > 0) {
    return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
  }

  if (hours > 0) {
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  }

  if (minutes > 0) {
    return secs > 0 ? `${minutes}m ${secs}s` : `${minutes}m`;
  }

  return `${secs}s`;
}
