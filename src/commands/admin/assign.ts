import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  Client,
  GuildMember,
  MessageFlags,
  Role,
  Guild,
} from "discord.js";
import { GuildConfig, PimUser } from "@prisma/client";
import { db } from "../../lib/database";
import { writeAuditLog } from "../../lib/audit";
import { getOrCreateGuildConfig } from "../../lib/guildConfig";
import { isWatchtowerAdmin } from "../../lib/permissions";

export const data = new SlashCommandBuilder()
  .setName("watchtower-assign")
  .setDescription("Assign role eligibility to a user (up to 3 roles at once).")
  .addUserOption((opt) => opt.setName("user").setDescription("The user").setRequired(true))
  .addRoleOption((opt) =>
    opt.setName("role1").setDescription("Role to make eligible (required)").setRequired(true)
  )
  .addRoleOption((opt) =>
    opt.setName("role2").setDescription("Additional role to make eligible (optional)").setRequired(false)
  )
  .addRoleOption((opt) =>
    opt.setName("role3").setDescription("Additional role to make eligible (optional)").setRequired(false)
  );

// ---------------------------------------------------------------------------
// Per-role outcome type
// ---------------------------------------------------------------------------
type RoleOutcome =
  | { status: "assigned";         roleName: string }
  | { status: "already_assigned"; roleName: string }
  | { status: "skipped";          roleName: string; reason: string };

async function processRole(
  client: Client,
  grantedBy: string,
  guildId: string,
  config: GuildConfig,
  pimUser: PimUser,
  botMember: GuildMember,
  role: Role,
): Promise<RoleOutcome> {
  // Guard: do not allow eligibility for the Watchtower Admin role
  if (config.adminRoleId && role.id === config.adminRoleId) {
    return {
      status: "skipped",
      roleName: role.name,
      reason: "this is the configured Watchtower Admin role",
    };
  }

  // Guard: role hierarchy check
  if (role.position >= botMember.roles.highest.position) {
    return {
      status: "skipped",
      roleName: role.name,
      reason: "role is at or above the bot in the server's role hierarchy",
    };
  }

  // Idempotency: check whether the assignment already exists
  const existing = await db.eligibleRole.findUnique({
    where: { pimUserId_roleId: { pimUserId: pimUser.id, roleId: role.id } },
  });

  await db.eligibleRole.upsert({
    where: { pimUserId_roleId: { pimUserId: pimUser.id, roleId: role.id } },
    update: { grantedBy, roleName: role.name },
    create: {
      pimUserId: pimUser.id,
      roleId: role.id,
      roleName: role.name,
      guildId,
      grantedBy,
    },
  });

  if (existing) {
    return { status: "already_assigned", roleName: role.name };
  }

  // Write audit entry only for genuinely new assignments
  await writeAuditLog(client, {
    guildId,
    discordUserId: pimUser.discordUserId,
    pimUserId: pimUser.id,
    eventType: "ELIGIBILITY_GRANTED",
    roleId: role.id,
    roleName: role.name,
    metadata: { grantedBy, isWatchtowerAdmin: true },
  });

  return { status: "assigned", roleName: role.name };
}

// ---------------------------------------------------------------------------
// Build a human-readable summary line for one outcome
// ---------------------------------------------------------------------------
function outcomeLabel(outcome: RoleOutcome): string {
  switch (outcome.status) {
    case "assigned":
      return `• **${outcome.roleName}** — assigned`;
    case "already_assigned":
      return `• **${outcome.roleName}** — already assigned (no change)`;
    case "skipped":
      return `• **${outcome.roleName}** — skipped: ${outcome.reason}`;
  }
}

// ---------------------------------------------------------------------------
// Command handler
// ---------------------------------------------------------------------------
export async function execute(interaction: ChatInputCommandInteraction, client: Client) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const guildId = interaction.guildId!;
  const config = await getOrCreateGuildConfig(guildId);
  const member = interaction.member as GuildMember;

  if (!isWatchtowerAdmin(member, config)) {
    return interaction.editReply(
      "You do not have permission to use this command.\n\nA Watchtower Admin role is required. Contact your server owner to be assigned the correct role."
    );
  }

  const target = interaction.options.getUser("user", true);

  // Ensure PIM user record exists (must have set a password first)
  const pimUser = await db.pimUser.findUnique({
    where: { discordUserId_guildId: { discordUserId: target.id, guildId } },
  });

  if (!pimUser) {
    return interaction.editReply(
      `<@${target.id}> has not set up a PIM account yet. Ask them to run \`/set-password\` first.`
    );
  }

  // Collect provided roles and deduplicate by role ID
  const rawRoles = [
    interaction.options.getRole("role1", true),
    interaction.options.getRole("role2"),
    interaction.options.getRole("role3"),
  ].filter((r): r is Role => r !== null);

  const uniqueRoles = [...new Map(rawRoles.map((r) => [r.id, r])).values()];

  // Fetch bot member once for the hierarchy check across all roles
  let botMember: GuildMember;
  let guild: Guild;
  try {
    guild = await client.guilds.fetch(guildId);
    botMember = guild.members.me ?? (await guild.members.fetchMe());
  } catch {
    return interaction.editReply(
      "Could not fetch guild information to verify role hierarchy. Please try again."
    );
  }

  // Process each role and collect outcomes
  const grantedBy = interaction.user.id;
  const outcomes: RoleOutcome[] = [];
  for (const role of uniqueRoles) {
    const outcome = await processRole(
      client,
      grantedBy,
      guildId,
      config,
      pimUser,
      botMember,
      role,
    );
    outcomes.push(outcome);
  }

  // Build reply
  const lines = outcomes.map(outcomeLabel);
  const allAlreadyAssigned = outcomes.every((o) => o.status === "already_assigned");
  const anyAssigned = outcomes.some((o) => o.status === "assigned");

  let footer: string;
  if (allAlreadyAssigned) {
    footer = "\nNo changes were made.";
  } else if (anyAssigned) {
    footer = "\nThey can use `/elevate` to request any newly assigned role.";
  } else {
    footer = "";
  }

  const verb = outcomes.length === 1 && outcomes[0].status === "assigned"
    ? "assigned"
    : "processed";

  return interaction.editReply(
    `Role eligibility ${verb} for <@${target.id}>:\n${lines.join("\n")}${footer}`
  );
}
