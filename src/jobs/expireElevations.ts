import cron from "node-cron";
import {
  Client,
  TextChannel,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from "discord.js";
import { db } from "../lib/database";
import { writeAuditLog } from "../lib/audit";

export function startExpiryJob(client: Client): void {
  // Run every minute to check for expiry warnings and expired elevations.
  cron.schedule("* * * * *", async () => {
    await runWarningScan(client);
    await runExpiryScan(client);
  });

  console.log("[Jobs] Elevation expiry job started");
}

// ---------------------------------------------------------------------------
// Warning scan — posts an expiry warning to the audit channel for any
// elevation that is within the guild's notifyBeforeMin window and has not
// yet been warned (notifiedAt IS NULL).
// ---------------------------------------------------------------------------
async function runWarningScan(client: Client): Promise<void> {
  // Only consider guilds that have notifications enabled and an audit channel.
  const configs = await db.guildConfig.findMany({
    where: {
      notifyBeforeMin: { gt: 0 },
      auditChannelId: { not: null },
    },
  });

  for (const config of configs) {
    const now = new Date();
    const windowEnd = new Date(now.getTime() + config.notifyBeforeMin * 60 * 1000);

    const toWarn = await db.activeElevation.findMany({
      where: {
        guildId: config.guildId,
        expiresAt: { lte: windowEnd, gt: now },
        notifiedAt: null,
      },
      include: { pimUser: true },
    });

    for (const elevation of toWarn) {
      // Mark as notified immediately — even if the channel post fails — to
      // prevent infinite retry spam if the channel is broken.
      await db.activeElevation.update({
        where: { id: elevation.id },
        data: { notifiedAt: new Date() },
      });

      // Post warning message to audit channel with "Extend Session" button.
      try {
        const channel = await client.channels.fetch(config.auditChannelId!) as TextChannel;
        if (channel?.isTextBased()) {
          const extendButton = new ButtonBuilder()
            .setCustomId(`extend_session:${elevation.id}`)
            .setLabel("Extend Session")
            .setStyle(ButtonStyle.Primary);

          const row = new ActionRowBuilder<ButtonBuilder>().addComponents(extendButton);

          await channel.send({
            content:
              `⏰ <@${elevation.pimUser.discordUserId}>, your **${elevation.roleName}** elevation expires ` +
              `<t:${Math.floor(elevation.expiresAt.getTime() / 1000)}:R>. ` +
              `Click **Extend Session** to reset your timer.`,
            components: [row],
          });
        }
      } catch (err) {
        // Non-fatal — notifiedAt already set, audit log still written below
        console.error(`[Jobs] Warning scan: failed to post to audit channel for guild ${config.guildId}`, err);
      }

      // skipChannelPost: the interactive warning message with the Extend Session button
      // was already posted above; we do not want a second plain-text echo alongside it.
      await writeAuditLog(client, {
        guildId: elevation.guildId,
        discordUserId: elevation.pimUser.discordUserId,
        pimUserId: elevation.pimUserId,
        eventType: "ELEVATION_EXPIRY_WARNING",
        roleId: elevation.roleId,
        roleName: elevation.roleName,
        metadata: {
          expiresAt: elevation.expiresAt.toISOString(),
          notifyBeforeMin: config.notifyBeforeMin,
        },
        skipChannelPost: true,
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Expiry scan — removes roles and cleans up records for sessions that have
// passed their expiresAt timestamp. Logic is unchanged from original.
// ---------------------------------------------------------------------------
async function runExpiryScan(client: Client): Promise<void> {
  const expired = await db.activeElevation.findMany({
    where: { expiresAt: { lte: new Date() } },
    include: { pimUser: true },
  });

  for (const elevation of expired) {
    try {
      const guild = await client.guilds.fetch(elevation.guildId);
      const member = await guild.members.fetch(elevation.pimUser.discordUserId);
      await member.roles.remove(elevation.roleId, "PIM session expired");
    } catch {
      // Member may have left — proceed with DB cleanup
    }

    await db.activeElevation.delete({ where: { id: elevation.id } });

    await writeAuditLog(client, {
      guildId: elevation.guildId,
      discordUserId: elevation.pimUser.discordUserId,
      pimUserId: elevation.pimUserId,
      eventType: "ELEVATION_EXPIRED",
      roleId: elevation.roleId,
      roleName: elevation.roleName,
    });
  }
}
