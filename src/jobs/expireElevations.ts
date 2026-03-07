import cron from "node-cron";
import { Client } from "discord.js";
import { db } from "../lib/database";
import { writeAuditLog } from "../lib/audit";

export function startExpiryJob(client: Client): void {
  // Run every minute to check for expired elevations
  cron.schedule("* * * * *", async () => {
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
  });

  console.log("[Jobs] Elevation expiry job started");
}
