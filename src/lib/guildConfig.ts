import { GuildConfig } from "@prisma/client";
import { db } from "./database";

const DEFAULT_SESSION_DURATION_MIN = parseInt(process.env.DEFAULT_SESSION_DURATION_MIN ?? "60", 10);
const DEFAULT_LOCKOUT_THRESHOLD = parseInt(process.env.DEFAULT_LOCKOUT_THRESHOLD ?? "5", 10);

export async function getOrCreateGuildConfig(guildId: string): Promise<GuildConfig> {
  return db.guildConfig.upsert({
    where: { guildId },
    update: {},
    create: {
      guildId,
      sessionDurationMin: DEFAULT_SESSION_DURATION_MIN,
      lockoutThreshold: DEFAULT_LOCKOUT_THRESHOLD,
    },
  });
}
