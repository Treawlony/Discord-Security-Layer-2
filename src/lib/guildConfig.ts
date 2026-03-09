import { GuildConfig } from "@prisma/client";
import { db } from "./database";

const DEFAULT_SESSION_DURATION_SEC = 3600; // 60 minutes
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
