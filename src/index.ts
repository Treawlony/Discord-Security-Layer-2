import "dotenv/config";
import { Client, GatewayIntentBits, Collection } from "discord.js";
import { loadCommands } from "./lib/commandLoader";
import { registerEvents } from "./lib/eventLoader";
import { startExpiryJob } from "./jobs/expireElevations";
import { db } from "./lib/database";

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
  ],
});

// Attach a commands collection to the client
(client as any).commands = new Collection();

async function main() {
  await db.$connect();
  console.log("[DB] Connected to PostgreSQL");

  await loadCommands(client);
  registerEvents(client);
  startExpiryJob(client);

  await client.login(process.env.DISCORD_TOKEN);
}

main().catch((err) => {
  console.error("[FATAL]", err);
  process.exit(1);
});
