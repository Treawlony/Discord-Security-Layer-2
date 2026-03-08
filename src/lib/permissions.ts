import { GuildMember, PermissionFlagsBits } from "discord.js";
import { GuildConfig } from "@prisma/client";

/**
 * Determines whether a guild member is a Watchtower Admin.
 *
 * Bootstrap mode (adminRoleId is null or empty):
 *   Returns true if the member holds Discord's Administrator permission.
 *   This allows the server owner to configure the bot on a fresh install.
 *
 * Configured mode (adminRoleId is set):
 *   Returns true ONLY if the member holds the designated Watchtower Admin role.
 *   Discord Administrator permission alone is NOT sufficient in this mode.
 *   This is intentional: the admin role is the sole gate once configured.
 *
 * This function is pure (synchronous, no DB or network calls).
 * The caller is responsible for ensuring the member's role cache is populated,
 * which is guaranteed for guild slash command interactions by discord.js.
 */
export function isWatchtowerAdmin(member: GuildMember, config: GuildConfig): boolean {
  // Bootstrap mode: no admin role configured — fall back to Discord Administrator
  if (!config.adminRoleId) {
    return member.permissions.has(PermissionFlagsBits.Administrator);
  }

  // Configured mode: Watchtower Admin role is the SOLE gate.
  // Administrator permission does NOT bypass this check.
  return member.roles.cache.has(config.adminRoleId);
}
