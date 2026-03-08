import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  Client,
  EmbedBuilder,
  MessageFlags,
} from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("help")
  .setDescription("Show all available commands and how Discord Watchtower works.");

export async function execute(interaction: ChatInputCommandInteraction, _client: Client): Promise<void> {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const embed = new EmbedBuilder()
    .setTitle("Discord Watchtower — Help")
    .setColor(0x5865f2)
    .setDescription(
      "**Discord Watchtower** is a Privileged Identity Manager (PIM) bot.\n" +
      "Instead of assigning powerful roles permanently, admins designate which roles " +
      "each user is *eligible* for. Users authenticate with a personal password, " +
      "request a temporary elevation, and the role is automatically removed when the " +
      "session expires."
    )
    .addFields(
      {
        name: "Getting Started (Users)",
        value:
          "1. Run `/set-password` to create your PIM account.\n" +
          "2. Ask an admin to run `/watchtower-assign` to grant you role eligibility.\n" +
          "3. Run `/elevate` and enter your password to receive a temporary elevated role.",
      },
      {
        name: "User Commands",
        value:
          "`/set-password` — Set or change your PIM password. Run this first before anything else.\n" +
          "`/elevate` — Authenticate and temporarily gain one of your eligible roles.\n" +
          "`/help` — Show this help message.",
      },
      {
        name: "Admin Commands",
        value:
          "*Require the Watchtower Admin role (or Discord Administrator in bootstrap mode).*\n\n" +
          "`/watchtower-assign` — Grant role eligibility to a user.\n" +
          "`/watchtower-revoke` — Remove a user's eligibility and end any active elevation session.\n" +
          "`/watchtower-list` — View all PIM role assignments in this server.\n" +
          "`/watchtower-unlock` — Clear an account lockout or admin block on a PIM account.\n" +
          "`/watchtower-config` — View or update session duration (e.g. `2h`, `30m`), expiry warning timing, lockout threshold, and logging channels.",
      }
    )
    .setFooter({ text: "Only you can see this message." })
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}
