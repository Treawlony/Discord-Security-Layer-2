import {
  ButtonInteraction,
  Client,
  GuildMember,
  MessageFlags,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from "discord.js";
import { db } from "./database";
import { writeAuditLog } from "./audit";
import { getOrCreateGuildConfig } from "./guildConfig";
import { isWatchtowerAdmin } from "./permissions";

// ---------------------------------------------------------------------------
// handleExtendSession
// customId: "extend_session:<elevationId>"
// Auth: only the elevated user themselves may click this button.
// ---------------------------------------------------------------------------
export async function handleExtendSession(
  interaction: ButtonInteraction,
  client: Client
): Promise<void> {
  // Acknowledge immediately — Discord requires a response within 3 seconds.
  // We use an ephemeral defer so the response is only visible to the clicker.
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const elevationId = interaction.customId.slice("extend_session:".length);

  const elevation = await db.activeElevation.findUnique({
    where: { id: elevationId },
    include: { pimUser: true },
  });

  if (!elevation) {
    await interaction.editReply({
      content: "This elevation has already expired or been revoked.",
    });
    return;
  }

  if (interaction.guildId !== elevation.guildId) {
    await interaction.editReply({
      content: "This action cannot be performed in this server.",
    });
    return;
  }

  // Only the user whose session this is may extend it.
  if (interaction.user.id !== elevation.pimUser.discordUserId) {
    await interaction.editReply({
      content: "Only the elevated user can extend their own session.",
    });
    return;
  }

  const config = await getOrCreateGuildConfig(elevation.guildId);
  const newExpiresAt = new Date(Date.now() + config.sessionDurationMin * 60 * 1000);

  await db.activeElevation.update({
    where: { id: elevationId },
    data: {
      expiresAt: newExpiresAt,
      notifiedAt: null, // Clear so the warning fires again near the new expiry
    },
  });

  await writeAuditLog(client, {
    guildId: elevation.guildId,
    discordUserId: elevation.pimUser.discordUserId,
    pimUserId: elevation.pimUserId,
    eventType: "ELEVATION_EXTENDED",
    roleId: elevation.roleId,
    roleName: elevation.roleName,
    metadata: { newExpiresAt: newExpiresAt.toISOString() },
  });

  // Disable the button on the original warning message so it cannot be clicked again.
  try {
    const disabledButton = new ButtonBuilder()
      .setCustomId(interaction.customId)
      .setLabel("Session Extended")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true);
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(disabledButton);
    await interaction.message.edit({ components: [row] });
  } catch {
    // Non-fatal — original message may have been deleted
  }

  await interaction.editReply({
    content: `Your **${elevation.roleName}** elevation has been extended until <t:${Math.floor(newExpiresAt.getTime() / 1000)}:R>.`,
  });
}

// ---------------------------------------------------------------------------
// handleRemovePerm
// customId: "remove_perm:<elevationId>"
// Auth: Watchtower Admin only.
// ---------------------------------------------------------------------------
export async function handleRemovePerm(
  interaction: ButtonInteraction,
  client: Client
): Promise<void> {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const elevationId = interaction.customId.slice("remove_perm:".length);

  const elevation = await db.activeElevation.findUnique({
    where: { id: elevationId },
    include: { pimUser: true },
  });

  if (!elevation) {
    await interaction.editReply({
      content: "This elevation has already expired or been revoked.",
    });
    return;
  }

  if (interaction.guildId !== elevation.guildId) {
    await interaction.editReply({
      content: "This action cannot be performed in this server.",
    });
    return;
  }

  const config = await getOrCreateGuildConfig(elevation.guildId);
  const member = interaction.member as GuildMember;

  if (!isWatchtowerAdmin(member, config)) {
    await interaction.editReply({
      content:
        "You do not have permission to use this control. A Watchtower Admin role is required.",
    });
    return;
  }

  // Remove the Discord role — non-fatal if member has left the guild.
  try {
    const guild = await client.guilds.fetch(elevation.guildId);
    const targetMember = await guild.members.fetch(elevation.pimUser.discordUserId);
    await targetMember.roles.remove(elevation.roleId, "PIM elevation revoked by admin");
  } catch {
    // Member may have left — proceed with DB cleanup
  }

  await db.activeElevation.delete({ where: { id: elevationId } });

  await writeAuditLog(client, {
    guildId: elevation.guildId,
    discordUserId: elevation.pimUser.discordUserId,
    pimUserId: elevation.pimUserId,
    eventType: "ELEVATION_ADMIN_REVOKED",
    roleId: elevation.roleId,
    roleName: elevation.roleName,
    metadata: {
      revokedBy: interaction.user.id,
      isWatchtowerAdmin: true,
    },
  });

  // Disable both action buttons on the original elevation-granted message.
  try {
    const disabledRow = _buildDisabledAdminRow(elevationId);
    await interaction.message.edit({ components: [disabledRow] });
  } catch {
    // Non-fatal
  }

  await interaction.editReply({
    content: `**${elevation.roleName}** has been removed from <@${elevation.pimUser.discordUserId}>.`,
  });
}

// ---------------------------------------------------------------------------
// handleRemovePermBlock
// customId: "remove_perm_block:<elevationId>"
// Auth: Watchtower Admin only.
// ---------------------------------------------------------------------------
export async function handleRemovePermBlock(
  interaction: ButtonInteraction,
  client: Client
): Promise<void> {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const elevationId = interaction.customId.slice("remove_perm_block:".length);

  const elevation = await db.activeElevation.findUnique({
    where: { id: elevationId },
    include: { pimUser: true },
  });

  if (!elevation) {
    await interaction.editReply({
      content: "This elevation has already expired or been revoked.",
    });
    return;
  }

  if (interaction.guildId !== elevation.guildId) {
    await interaction.editReply({
      content: "This action cannot be performed in this server.",
    });
    return;
  }

  const config = await getOrCreateGuildConfig(elevation.guildId);
  const member = interaction.member as GuildMember;

  if (!isWatchtowerAdmin(member, config)) {
    await interaction.editReply({
      content:
        "You do not have permission to use this control. A Watchtower Admin role is required.",
    });
    return;
  }

  // Remove the Discord role — non-fatal if member has left.
  try {
    const guild = await client.guilds.fetch(elevation.guildId);
    const targetMember = await guild.members.fetch(elevation.pimUser.discordUserId);
    await targetMember.roles.remove(elevation.roleId, "PIM elevation revoked and user blocked by admin");
  } catch {
    // Member may have left — proceed with DB cleanup
  }

  await db.activeElevation.delete({ where: { id: elevationId } });

  // Block the PIM user so they cannot elevate until an admin runs /watchtower-unlock.
  await db.pimUser.update({
    where: { id: elevation.pimUserId },
    data: { blockedAt: new Date() },
  });

  await writeAuditLog(client, {
    guildId: elevation.guildId,
    discordUserId: elevation.pimUser.discordUserId,
    pimUserId: elevation.pimUserId,
    eventType: "ELEVATION_ADMIN_REVOKED_BLOCKED",
    roleId: elevation.roleId,
    roleName: elevation.roleName,
    metadata: {
      revokedBy: interaction.user.id,
      isWatchtowerAdmin: true,
    },
  });

  await writeAuditLog(client, {
    guildId: elevation.guildId,
    discordUserId: elevation.pimUser.discordUserId,
    pimUserId: elevation.pimUserId,
    eventType: "ELEVATION_BLOCKED",
    metadata: {
      blockedBy: interaction.user.id,
      isWatchtowerAdmin: true,
    },
  });

  // Disable both action buttons on the original elevation-granted message.
  try {
    const disabledRow = _buildDisabledAdminRow(elevationId);
    await interaction.message.edit({ components: [disabledRow] });
  } catch {
    // Non-fatal
  }

  await interaction.editReply({
    content:
      `**${elevation.roleName}** has been removed from <@${elevation.pimUser.discordUserId}> and their PIM account has been blocked. ` +
      `Use \`/watchtower-unlock\` to restore their access.`,
  });
}

// ---------------------------------------------------------------------------
// Internal helper — builds a disabled version of the admin action row
// ---------------------------------------------------------------------------
function _buildDisabledAdminRow(elevationId: string): ActionRowBuilder<ButtonBuilder> {
  const removeBtn = new ButtonBuilder()
    .setCustomId(`remove_perm:${elevationId}`)
    .setLabel("Remove Permission")
    .setStyle(ButtonStyle.Danger)
    .setDisabled(true);

  const removeBlockBtn = new ButtonBuilder()
    .setCustomId(`remove_perm_block:${elevationId}`)
    .setLabel("Remove Permission and Block")
    .setStyle(ButtonStyle.Danger)
    .setDisabled(true);

  return new ActionRowBuilder<ButtonBuilder>().addComponents(removeBtn, removeBlockBtn);
}
