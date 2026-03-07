import { Client, Collection } from "discord.js";
import path from "path";
import fs from "fs";

export async function loadCommands(client: Client): Promise<void> {
  const commands = new Collection<string, any>();
  const commandsPath = path.join(__dirname, "..", "commands");

  const walkDir = (dir: string) => {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walkDir(fullPath);
      } else if (entry.name.endsWith(".js") || entry.name.endsWith(".ts")) {
        const command = require(fullPath);
        if ("data" in command && "execute" in command) {
          commands.set(command.data.name, command);
        }
      }
    }
  };

  walkDir(commandsPath);
  (client as any).commands = commands;
  console.log(`[Commands] Loaded ${commands.size} command(s)`);
}
