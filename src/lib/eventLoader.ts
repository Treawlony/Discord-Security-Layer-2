import { Client } from "discord.js";
import { onReady } from "../events/ready";
import { onInteractionCreate } from "../events/interactionCreate";

export function registerEvents(client: Client): void {
  client.once("clientReady", () => { onReady(client).catch(console.error); });
  client.on("interactionCreate", (interaction) => onInteractionCreate(client, interaction));
}
