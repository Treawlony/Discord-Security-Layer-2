import "dotenv/config";
import "./lib/env"; // validate required env vars before anything else
import { Client, GatewayIntentBits, Collection } from "discord.js";
import { ScheduledTask } from "node-cron";
import { loadCommands } from "./lib/commandLoader";
import { registerEvents } from "./lib/eventLoader";
import { startExpiryJob } from "./jobs/expireElevations";
import { db } from "./lib/database";
import { env } from "./lib/env";

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    // NOTE: GuildMembers (Server Members Intent) intentionally NOT requested.
    // All member access is single-fetch-by-ID (guild.members.fetch(userId)) and
    // role add/remove, which use the REST API and do not require the privileged
    // gateway intent. Requesting it here would crash login (DisallowedIntents)
    // whenever the portal toggle is off (e.g. during intent review).
  ],
});

// Attach a commands collection to the client
(client as any).commands = new Collection();

// ---------------------------------------------------------------------------
// Graceful shutdown
// ---------------------------------------------------------------------------
let isShuttingDown = false;

async function shutdown(signal: string, task: ScheduledTask | null): Promise<void> {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log(`[Shutdown] Signal received: ${signal}`);

  try {
    if (task) {
      console.log("[Shutdown] Stopping cron job...");
      task.stop();
      console.log("[Shutdown] Cron job stopped.");
    }

    console.log("[Shutdown] Disconnecting from database...");
    await db.$disconnect();
    console.log("[Shutdown] Database disconnected.");

    console.log("[Shutdown] Destroying Discord client...");
    client.destroy();
    console.log("[Shutdown] Discord client destroyed.");

    console.log("[Shutdown] Goodbye.");
    process.exit(0);
  } catch (err) {
    console.error("[Shutdown] Error during shutdown:", err);
    process.exit(1);
  }
}

async function main() {
  await db.$connect();
  console.log("[DB] Connected to PostgreSQL");

  await loadCommands(client);
  registerEvents(client);
  const task = startExpiryJob(client);

  process.on("SIGTERM", () => shutdown("SIGTERM", task));
  process.on("SIGINT",  () => shutdown("SIGINT",  task));

  await client.login(env.DISCORD_TOKEN);
}

main().catch((err) => {
  console.error("[FATAL]", err);
  process.exit(1);
});
