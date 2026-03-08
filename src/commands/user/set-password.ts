import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  Client,
  MessageFlags,
} from "discord.js";
import { db } from "../../lib/database";
import { hashPassword, PasswordSchema } from "../../lib/crypto";
import { writeAuditLog } from "../../lib/audit";

export const data = new SlashCommandBuilder()
  .setName("set-password")
  .setDescription("Set or change your PIM password for role elevation.")
  .addStringOption((opt) =>
    opt.setName("password").setDescription("Your new password").setRequired(true)
  );

export async function execute(interaction: ChatInputCommandInteraction, client: Client) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const password = interaction.options.getString("password", true);
  const guildId = interaction.guildId!;
  const discordUserId = interaction.user.id;

  // Validate complexity
  const result = PasswordSchema.safeParse(password);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `• ${i.message}`).join("\n");
    return interaction.editReply(`Password does not meet complexity requirements:\n${issues}`);
  }

  const hash = await hashPassword(password);
  const existing = await db.pimUser.findUnique({ where: { discordUserId_guildId: { discordUserId, guildId } } });

  if (existing) {
    await db.pimUser.update({ where: { id: existing.id }, data: { passwordHash: hash } });
    await writeAuditLog(client, { guildId, discordUserId, pimUserId: existing.id, eventType: "PASSWORD_CHANGED" });
    return interaction.editReply("Your PIM password has been updated.");
  } else {
    const user = await db.pimUser.create({ data: { discordUserId, guildId, passwordHash: hash } });
    await writeAuditLog(client, { guildId, discordUserId, pimUserId: user.id, eventType: "PASSWORD_SET" });
    return interaction.editReply("PIM password set. You can now use `/elevate` when you have eligible roles.");
  }
}
