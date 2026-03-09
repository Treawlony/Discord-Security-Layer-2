import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  Client,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  MessageFlags,
  TextChannel,
} from "discord.js";
import { db } from "../../lib/database";
import { verifyPassword } from "../../lib/crypto";
import { writeAuditLog } from "../../lib/audit";
import { getOrCreateGuildConfig } from "../../lib/guildConfig";

// ---------------------------------------------------------------------------
// Rate limiting — spam gate (distinct from the brute-force lockout mechanism)
// ---------------------------------------------------------------------------
const RATE_LIMIT_WINDOW_MS = 60_000;  // rolling window length
const RATE_LIMIT_MAX_ATTEMPTS = 3;    // max invocations allowed within the window

// Map key: `${guildId}:${userId}` — isolates per-guild so multi-guild users
// are tracked independently. Values are arrays of invocation timestamps (ms).
const elevateCooldowns = new Map<string, number[]>();

function isRateLimited(key: string): boolean {
  const now = Date.now();
  const recent = (elevateCooldowns.get(key) ?? []).filter(
    (ts) => now - ts < RATE_LIMIT_WINDOW_MS,
  );

  if (recent.length >= RATE_LIMIT_MAX_ATTEMPTS) {
    // Rejected — update the map with the pruned list (no new timestamp added).
    elevateCooldowns.set(key, recent);
    return true;
  }

  // Allowed — record this attempt. Push before writing so a first-ever call
  // (recent was []) sets the entry; a call where all prior timestamps expired
  // (recent was also []) naturally replaces the stale entry with just one
  // fresh timestamp, keeping the Map bounded over long process uptime.
  recent.push(now);
  elevateCooldowns.set(key, recent);
  return false;
}

// ---------------------------------------------------------------------------
// Command definition
// ---------------------------------------------------------------------------

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

  // Rate-limit check — before any DB access or password work
  const rlKey = `${guildId}:${discordUserId}`;
  if (isRateLimited(rlKey)) {
    return interaction.editReply(
      "You are sending commands too quickly. Please wait a moment before trying again."
    );
  }

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

  // Block check — set by admin "Remove Permission and Block" action
  if (pimUser.blockedAt) {
    return interaction.editReply(
      "Your PIM account has been blocked by an administrator. Contact a Watchtower Admin to restore access."
    );
  }

  // Null-password check — set when admin runs /watchtower-reset-password
  if (pimUser.passwordHash === null) {
    return interaction.editReply(
      "Your PIM password has been reset by an administrator. Please run /set-password to set a new password before you can elevate."
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

    const expiresAt = new Date(Date.now() + config.sessionDurationSec * 1000);

    try {
      const guild = await client.guilds.fetch(guildId);

      // Verify the bot can manage this role before attempting assignment
      const botMember = guild.members.me ?? (await guild.members.fetchMe());
      const targetRole = guild.roles.cache.get(roleId) ?? (await guild.roles.fetch(roleId));
      if (!targetRole || targetRole.position >= botMember.roles.highest.position) {
        await interaction.editReply({
          content:
            `Cannot grant **${eligible.roleName}** — this role is at or above the bot in the server's role hierarchy.\n\n` +
            `Ask an administrator to go to **Server Settings → Roles** and drag the bot's role above **${eligible.roleName}**.`,
          components: [],
        });
        return;
      }

      const member = await guild.members.fetch(discordUserId);
      await member.roles.add(roleId, `PIM elevation by ${interaction.user.tag}`);
    } catch {
      await interaction.editReply({ content: "Failed to assign role. Check bot permissions.", components: [] });
      return;
    }

    const elevation = await db.activeElevation.upsert({
      where: { pimUserId_roleId: { pimUserId: pimUser.id, roleId } },
      update: { expiresAt, elevatedAt: new Date(), notifiedAt: null },
      create: { pimUserId: pimUser.id, roleId, roleName: eligible.roleName, guildId, expiresAt },
    });

    // skipChannelPost: the interactive message with admin buttons is posted below;
    // we do not want writeAuditLog to also emit a plain-text echo to the same channel.
    await writeAuditLog(client, {
      guildId,
      discordUserId,
      pimUserId: pimUser.id,
      eventType: "ELEVATION_GRANTED",
      roleId,
      roleName: eligible.roleName,
      metadata: { expiresAt: expiresAt.toISOString() },
      skipChannelPost: true,
    });

    // Fetch fresh config to get channel IDs
    const freshConfig = await getOrCreateGuildConfig(guildId);
    const expiryUnix = Math.floor(expiresAt.getTime() / 1000);

    let auditMessageId: string | undefined;
    let alertMessageId: string | undefined;

    // Audit channel — admin-facing log with Remove Permission / Remove Permission and Block buttons.
    if (freshConfig.auditChannelId) {
      try {
        const auditChannel = await client.channels.fetch(freshConfig.auditChannelId) as TextChannel;
        if (auditChannel?.isTextBased()) {
          const removeBtn = new ButtonBuilder()
            .setCustomId(`remove_perm:${elevation.id}`)
            .setLabel("Remove Permission")
            .setStyle(ButtonStyle.Danger);

          const removeBlockBtn = new ButtonBuilder()
            .setCustomId(`remove_perm_block:${elevation.id}`)
            .setLabel("Remove Permission and Block")
            .setStyle(ButtonStyle.Danger);

          const adminRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
            removeBtn,
            removeBlockBtn
          );

          const auditMsg = await auditChannel.send({
            content:
              `⬆️ **PIM Elevation** — <@${discordUserId}> has been granted **${eligible.roleName}** until <t:${expiryUnix}:R>`,
            components: [adminRow],
          });
          auditMessageId = auditMsg.id;
        }
      } catch (err) {
        console.error("[elevate] Failed to post to audit channel:", err);
      }
    }

    // Alert channel — user-facing ping with a self-revoke button.
    if (freshConfig.alertChannelId) {
      try {
        const alertChannel = await client.channels.fetch(freshConfig.alertChannelId) as TextChannel;
        if (alertChannel?.isTextBased()) {
          const selfRevokeBtn = new ButtonBuilder()
            .setCustomId(`self_revoke:${elevation.id}`)
            .setLabel("Revoke Early")
            .setStyle(ButtonStyle.Secondary);

          const alertRow = new ActionRowBuilder<ButtonBuilder>().addComponents(selfRevokeBtn);

          const alertMsg = await alertChannel.send({
            content: `⬆️ <@${discordUserId}>, you have been granted **${eligible.roleName}** until <t:${expiryUnix}:R>.`,
            components: [alertRow],
          });
          alertMessageId = alertMsg.id;
        }
      } catch (err) {
        console.error("[elevate] Failed to post to alert channel:", err);
      }
    }

    // Persist message IDs so sessions endings can disable the buttons.
    if (auditMessageId || alertMessageId) {
      try {
        await db.activeElevation.update({
          where: { id: elevation.id },
          data: {
            auditMessageId: auditMessageId ?? null,
            alertMessageId: alertMessageId ?? null,
          },
        });
      } catch (err) {
        console.error("[elevate] Failed to store message IDs on elevation:", err);
      }
    }

    await interaction.editReply({
      content: `You have been elevated to **${eligible.roleName}** until <t:${expiryUnix}:R>.`,
      components: [],
    });
  });

  collector?.on("end", async (collected) => {
    if (collected.size === 0) {
      await interaction.editReply({ content: "Elevation timed out. Run `/elevate` again.", components: [] });
    }
  });
}
