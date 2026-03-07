import { AuditEventType } from "@prisma/client";
import { Client, TextChannel } from "discord.js";
import { db } from "./database";

interface AuditParams {
  guildId: string;
  discordUserId: string;
  pimUserId?: string;
  eventType: AuditEventType;
  roleId?: string;
  roleName?: string;
  metadata?: Record<string, unknown>;
}

export async function writeAuditLog(client: Client, params: AuditParams): Promise<void> {
  const log = await db.auditLog.create({
    data: {
      guildId: params.guildId,
      discordUserId: params.discordUserId,
      pimUserId: params.pimUserId,
      eventType: params.eventType,
      roleId: params.roleId,
      roleName: params.roleName,
      metadata: params.metadata ?? {},
    },
  });

  // Post to audit channel if configured
  const config = await db.guildConfig.findUnique({ where: { guildId: params.guildId } });
  if (config?.auditChannelId) {
    try {
      const channel = await client.channels.fetch(config.auditChannelId) as TextChannel;
      if (channel?.isTextBased()) {
        const emoji = eventTypeEmoji(params.eventType);
        const rolePart = params.roleName ? ` | Role: **${params.roleName}**` : "";
        await channel.send(
          `${emoji} \`${params.eventType}\` — <@${params.discordUserId}>${rolePart} — <t:${Math.floor(log.createdAt.getTime() / 1000)}:R>`
        );
      }
    } catch {
      // Non-fatal — audit DB record already written
    }
  }
}

function eventTypeEmoji(type: AuditEventType): string {
  const map: Partial<Record<AuditEventType, string>> = {
    ELEVATION_GRANTED: "⬆️",
    ELEVATION_EXPIRED: "⏱️",
    ELEVATION_REVOKED: "⬇️",
    ELEVATION_REQUESTED: "🔑",
    FAILED_ATTEMPT: "⚠️",
    ACCOUNT_LOCKED: "🔒",
    ACCOUNT_UNLOCKED: "🔓",
    PASSWORD_SET: "🔐",
    PASSWORD_CHANGED: "🔄",
    ELIGIBILITY_GRANTED: "✅",
    ELIGIBILITY_REVOKED: "❌",
  };
  return map[type] ?? "📋";
}
