import { Client, Interaction, MessageFlags } from "discord.js";

export async function onInteractionCreate(client: Client, interaction: Interaction): Promise<void> {
  if (!interaction.isChatInputCommand()) return;

  const command = (client as any).commands?.get(interaction.commandName);
  if (!command) {
    await interaction.reply({ content: "Unknown command.", flags: MessageFlags.Ephemeral as number });
    return;
  }

  try {
    await command.execute(interaction, client);
  } catch (err) {
    console.error(`[Command:${interaction.commandName}]`, err);
    const payload = { content: "An error occurred while executing this command.", flags: MessageFlags.Ephemeral as number };
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(payload);
    } else {
      await interaction.reply(payload);
    }
  }
}
