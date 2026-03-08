import { GuildConfig } from "@prisma/client";
import { db } from "./database";

// Default session duration in seconds (env var is kept in minutes for backward
// compatibility but converted here so the rest of the codebase works in seconds).
const DEFAULT_SESSION_DURATION_SEC = parseInt(process.env.DEFAULT_SESSION_DURATION_MIN ?? "60", 10) * 60;
const DEFAULT_LOCKOUT_THRESHOLD = parseInt(process.env.DEFAULT_LOCKOUT_THRESHOLD ?? "5", 10);

export async function getOrCreateGuildConfig(guildId: string): Promise<GuildConfig> {
  return db.guildConfig.upsert({
    where: { guildId },
    update: {},
    create: {
      guildId,
      sessionDurationSec: DEFAULT_SESSION_DURATION_SEC,
      lockoutThreshold: DEFAULT_LOCKOUT_THRESHOLD,
    },
  });
}
