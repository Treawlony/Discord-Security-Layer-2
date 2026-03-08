import "dotenv/config";
import { REST, Routes } from "discord.js";
import path from "path";
import fs from "fs";

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.DISCORD_CLIENT_ID;

if (!token) {
  console.error("[deploy-commands] DISCORD_TOKEN is required.");
  process.exit(1);
}
if (!clientId) {
  console.error("[deploy-commands] DISCORD_CLIENT_ID is required.");
  process.exit(1);
}

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

const rest = new REST().setToken(token as string);

(async () => {
  console.log(`Deploying ${commands.length} command(s) globally...`);
  await rest.put(Routes.applicationCommands(clientId as string), { body: commands });
  console.log("Global deployment done. Commands propagate to all servers within ~1 hour.");
})();
