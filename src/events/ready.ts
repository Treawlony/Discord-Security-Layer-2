import { Client, REST, Routes } from "discord.js";

export async function onReady(client: Client): Promise<void> {
  console.log(`[Bot] Logged in as ${client.user?.tag}`);

  const commands = [...(client as any).commands.values()].map((cmd: any) => cmd.data.toJSON());
  const rest = new REST().setToken(process.env.DISCORD_TOKEN!);
  try {
    await rest.put(Routes.applicationCommands(client.user!.id), { body: commands });
    console.log(`[Bot] Registered ${commands.length} global slash command(s)`);
  } catch (err) {
    console.error("[Bot] Failed to register slash commands:", err);
  }
}
