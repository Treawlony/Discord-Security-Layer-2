import "dotenv/config";
import "./lib/env"; // validate required env vars before anything else
import { REST, Routes } from "discord.js";
import path from "path";
import fs from "fs";
import { env } from "./lib/env";

const token = env.DISCORD_TOKEN;
const clientId = env.DISCORD_CLIENT_ID;
const guildId = process.env.DISCORD_GUILD_ID; // optional for dev

const commands: object[] = [];

const commandsPath = path.join(__dirname, "commands");

const walkDir = (dir: string) => {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkDir(fullPath);
    } else if (entry.name.endsWith(".js") || entry.name.endsWith(".ts")) {
      const command = require(fullPath);
      if ("data" in command) {
        commands.push(command.data.toJSON());
      }
    }
  }
};

walkDir(commandsPath);

const rest = new REST().setToken(token);

(async () => {
  console.log(`Deploying ${commands.length} command(s)...`);
  if (guildId) {
    await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commands });
    console.log(`Deployed to guild ${guildId} (instant)`);
  } else {
    await rest.put(Routes.applicationCommands(clientId), { body: commands });
    console.log("Deployed globally (may take up to 1 hour to propagate)");
  }
})();
