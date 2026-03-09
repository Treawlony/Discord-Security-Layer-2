import { ButtonInteraction, Client, Interaction, MessageFlags } from "discord.js";
import {
  handleExtendSession,
  handleRemovePerm,
  handleRemovePermBlock,
  handleSelfRevoke,
} from "../lib/buttonHandlers";

export async function onInteractionCreate(client: Client, interaction: Interaction): Promise<void> {
  // Button interactions — route by customId prefix.
  // Note: "remove_perm_block:" is checked before "remove_perm:" because
  // startsWith("remove_perm:") would otherwise also match "remove_perm_block:".
  if (interaction.isButton()) {
    const { customId } = interaction;
    const btn = interaction as ButtonInteraction;
    try {
      if (customId.startsWith("extend_session:")) {
        await handleExtendSession(btn, client);
      } else if (customId.startsWith("self_revoke:")) {
        await handleSelfRevoke(btn, client);
      } else if (customId.startsWith("remove_perm_block:")) {
        await handleRemovePermBlock(btn, client);
      } else if (customId.startsWith("remove_perm:")) {
        await handleRemovePerm(btn, client);
      }
      // Unknown button customIds are silently ignored.
    } catch (err) {
      console.error(`[Button:${customId}]`, err);
    }
    return;
  }

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
