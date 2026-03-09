import cron, { ScheduledTask } from "node-cron";
import {
  Client,
  TextChannel,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from "discord.js";
import { db } from "../lib/database";
import { writeAuditLog } from "../lib/audit";
import { buildExpiryWarningAlertEmbed, buildExpiryWarningAuditEmbed } from "../lib/embeds";

export function startExpiryJob(client: Client): ScheduledTask {
  // Run every minute to check for expiry warnings and expired elevations.
  const task = cron.schedule("* * * * *", async () => {
    await runWarningScan(client);
    await runExpiryScan(client);
  });

  console.log("[Jobs] Elevation expiry job started");
  return task;
}

// ---------------------------------------------------------------------------
// Warning scan — posts an expiry warning to the audit channel for any
// elevation that is within the guild's notifyBeforeSec window and has not
// yet been warned (notifiedAt IS NULL).
// ---------------------------------------------------------------------------
async function runWarningScan(client: Client): Promise<void> {
  // Consider guilds that have notifications enabled and at least one output channel.
  const configs = await db.guildConfig.findMany({
    where: {
      notifyBeforeSec: { gt: 0 },
      OR: [
        { auditChannelId: { not: null } },
        { alertChannelId: { not: null } },
      ],
    },
  });

  for (const config of configs) {
    const now = new Date();
    // Extend the window by one cron interval (60s) to avoid missing sessions
    // that fall just outside the window at one tick and get caught too late.
    const windowEnd = new Date(now.getTime() + (config.notifyBeforeSec + 60) * 1000);

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

      // Alert channel — user-facing ping with Extend Session button.
      if (config.alertChannelId) {
        try {
          const alertChannel = await client.channels.fetch(config.alertChannelId) as TextChannel;
          if (alertChannel?.isTextBased()) {
            const extendButton = new ButtonBuilder()
              .setCustomId(`extend_session:${elevation.id}`)
              .setLabel("Extend Session")
              .setStyle(ButtonStyle.Primary);

            const row = new ActionRowBuilder<ButtonBuilder>().addComponents(extendButton);

            // content: ping is required — <@userId> inside an embed description does NOT
            // trigger a Discord notification. Only the message content field sends a ping.
            const warningMsg = await alertChannel.send({
              content: `<@${elevation.pimUser.discordUserId}>`,
              embeds: [buildExpiryWarningAlertEmbed(
                elevation.pimUser.discordUserId,
                elevation.roleName,
                elevation.expiresAt
              )],
              components: [row],
            });

            // Store the warning message ID so any session-ending path can remove
            // the Extend Session button when the session is no longer active.
            await db.activeElevation.update({
              where: { id: elevation.id },
              data: { warningMessageId: warningMsg.id },
            });
          }
        } catch (err) {
          console.error(`[Jobs] Warning scan: failed to post to alert channel for guild ${config.guildId}`, err);
        }
      }

      // Audit channel — admin-facing plain text notification (no Extend Session button).
      if (config.auditChannelId) {
        try {
          const auditChannel = await client.channels.fetch(config.auditChannelId) as TextChannel;
          if (auditChannel?.isTextBased()) {
            await auditChannel.send({
              embeds: [buildExpiryWarningAuditEmbed(
                elevation.pimUser.discordUserId,
                elevation.roleName,
                elevation.expiresAt
              )],
            });
          }
        } catch (err) {
          console.error(`[Jobs] Warning scan: failed to post to audit channel for guild ${config.guildId}`, err);
        }
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
          notifyBeforeSec: config.notifyBeforeSec,
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

    // Disable buttons on the elevation-granted messages so they cannot be interacted with after expiry.
    const config = await db.guildConfig.findUnique({ where: { guildId: elevation.guildId } });

    if (config?.alertChannelId && elevation.alertMessageId) {
      try {
        const alertChannel = await client.channels.fetch(config.alertChannelId) as TextChannel;
        if (alertChannel?.isTextBased()) {
          const msg = await (alertChannel as TextChannel).messages.fetch(elevation.alertMessageId);
          await msg.edit({ components: [] });
        }
      } catch {
        // Non-fatal — message may have been deleted
      }
    }

    if (config?.auditChannelId && elevation.auditMessageId) {
      try {
        const auditChannel = await client.channels.fetch(config.auditChannelId) as TextChannel;
        if (auditChannel?.isTextBased()) {
          const msg = await (auditChannel as TextChannel).messages.fetch(elevation.auditMessageId);
          await msg.edit({ components: [] });
        }
      } catch {
        // Non-fatal — message may have been deleted
      }
    }

    // Remove the Extend Session button from the expiry warning message (if one was posted).
    // This message is separate from alertMessageId/auditMessageId — it is the warning post
    // created by runWarningScan and stored as warningMessageId.
    if (config?.alertChannelId && elevation.warningMessageId) {
      try {
        const alertChannel = await client.channels.fetch(config.alertChannelId) as TextChannel;
        if (alertChannel?.isTextBased()) {
          const msg = await (alertChannel as TextChannel).messages.fetch(elevation.warningMessageId);
          await msg.edit({ components: [] });
        }
      } catch {
        // Non-fatal — message may have been deleted
      }
    }
  }
}
