import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  Client,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ComponentType,
  MessageFlags,
} from "discord.js";
import { db } from "../../lib/database";
import { verifyPassword } from "../../lib/crypto";
import { writeAuditLog } from "../../lib/audit";
import { getOrCreateGuildConfig } from "../../lib/guildConfig";

export const data = new SlashCommandBuilder()
  .setName("elevate")
  .setDescription("Request temporary elevation to one of your eligible roles.")
  .addStringOption((opt) =>
    opt.setName("password").setDescription("Your PIM password").setRequired(true)
  );

export async function execute(interaction: ChatInputCommandInteraction, client: Client) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const guildId = interaction.guildId!;
  const discordUserId = interaction.user.id;
  const password = interaction.options.getString("password", true);

  const config = await getOrCreateGuildConfig(guildId);

  const pimUser = await db.pimUser.findUnique({
    where: { discordUserId_guildId: { discordUserId, guildId } },
    include: { eligibleRoles: true },
  });

  if (!pimUser) {
    return interaction.editReply("You do not have a PIM account. Use `/set-password` first.");
  }

  // Lockout check
  if (pimUser.lockedAt) {
    return interaction.editReply(
      "Your PIM account is locked due to too many failed attempts. Contact an administrator."
    );
  }

  // Verify password
  const valid = await verifyPassword(password, pimUser.passwordHash);
  if (!valid) {
    const newFailures = pimUser.failedAttempts + 1;
    const isNowLocked = newFailures >= config.lockoutThreshold;

    await db.pimUser.update({
      where: { id: pimUser.id },
      data: {
        failedAttempts: newFailures,
        lockedAt: isNowLocked ? new Date() : undefined,
      },
    });

    await writeAuditLog(client, {
      guildId,
      discordUserId,
      pimUserId: pimUser.id,
      eventType: "FAILED_ATTEMPT",
      metadata: { attemptsCount: newFailures },
    });

    if (isNowLocked) {
      await writeAuditLog(client, {
        guildId,
        discordUserId,
        pimUserId: pimUser.id,
        eventType: "ACCOUNT_LOCKED",
      });
      return interaction.editReply(
        `Incorrect password. Your account has been locked after ${newFailures} failed attempts. Contact an administrator.`
      );
    }

    const remaining = config.lockoutThreshold - newFailures;
    return interaction.editReply(
      `Incorrect password. ${remaining} attempt(s) remaining before lockout.`
    );
  }

  // Reset failed attempts on success
  await db.pimUser.update({ where: { id: pimUser.id }, data: { failedAttempts: 0 } });

  // Filter out the Watchtower Admin role so users cannot elevate to bot management permissions.
  const availableRoles = config.adminRoleId
    ? pimUser.eligibleRoles.filter((r) => r.roleId !== config.adminRoleId)
    : pimUser.eligibleRoles;

  if (availableRoles.length === 0) {
    return interaction.editReply("You have no eligible roles available. Contact an administrator.");
  }

  await writeAuditLog(client, {
    guildId,
    discordUserId,
    pimUserId: pimUser.id,
    eventType: "ELEVATION_REQUESTED",
  });

  // Build role select menu from the filtered list
  const options = availableRoles.map((r) =>
    new StringSelectMenuOptionBuilder().setLabel(r.roleName).setValue(r.roleId)
  );

  const menu = new StringSelectMenuBuilder()
    .setCustomId("elevate_role_select")
    .setPlaceholder("Select a role to elevate")
    .addOptions(options);

  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu);

  await interaction.editReply({
    content: "Select a role to elevate to:",
    components: [row],
  });

  // Collect the selection (30s timeout)
  const collector = interaction.channel?.createMessageComponentCollector({
    componentType: ComponentType.StringSelect,
    filter: (i) => i.user.id === discordUserId && i.customId === "elevate_role_select",
    time: 30_000,
    max: 1,
  });

  collector?.on("collect", async (selectInteraction) => {
    await selectInteraction.deferUpdate();

    const roleId = selectInteraction.values[0];
    const eligible = availableRoles.find((r) => r.roleId === roleId);
    if (!eligible) return;

    const expiresAt = new Date(Date.now() + config.sessionDurationMin * 60 * 1000);

    try {
      const guild = await client.guilds.fetch(guildId);
      const member = await guild.members.fetch(discordUserId);
      await member.roles.add(roleId, `PIM elevation by ${interaction.user.tag}`);
    } catch {
      await interaction.editReply({ content: "Failed to assign role. Check bot permissions.", components: [] });
      return;
    }

    await db.activeElevation.upsert({
      where: { pimUserId_roleId: { pimUserId: pimUser.id, roleId } },
      update: { expiresAt, elevatedAt: new Date() },
      create: { pimUserId: pimUser.id, roleId, roleName: eligible.roleName, guildId, expiresAt },
    });

    await writeAuditLog(client, {
      guildId,
      discordUserId,
      pimUserId: pimUser.id,
      eventType: "ELEVATION_GRANTED",
      roleId,
      roleName: eligible.roleName,
      metadata: { expiresAt: expiresAt.toISOString() },
    });

    // Admin alert
    const config2 = await getOrCreateGuildConfig(guildId);
    if (config2.alertChannelId) {
      try {
        const guild = await client.guilds.fetch(guildId);
        const alertChannel = guild.channels.cache.get(config2.alertChannelId);
        if (alertChannel?.isTextBased()) {
          await (alertChannel as any).send(
            `⬆️ **PIM Elevation** — <@${discordUserId}> has been granted **${eligible.roleName}** until <t:${Math.floor(expiresAt.getTime() / 1000)}:R>`
          );
        }
      } catch {
        // Non-fatal
      }
    }

    await interaction.editReply({
      content: `You have been elevated to **${eligible.roleName}** until <t:${Math.floor(expiresAt.getTime() / 1000)}:R>.`,
      components: [],
    });
  });

  collector?.on("end", async (collected) => {
    if (collected.size === 0) {
      await interaction.editReply({ content: "Elevation timed out. Run `/elevate` again.", components: [] });
    }
  });
}
