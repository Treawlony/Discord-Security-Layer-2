import { Client } from "discord.js";
import { onReady } from "../events/ready";
import { onInteractionCreate } from "../events/interactionCreate";

export function registerEvents(client: Client): void {
  client.once("ready", () => onReady(client));
  client.on("interactionCreate", (interaction) => onInteractionCreate(client, interaction));
}
