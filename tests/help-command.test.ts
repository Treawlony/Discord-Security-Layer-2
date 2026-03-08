/**
 * Unit tests for src/commands/user/help.ts
 *
 * Strategy: import the module, inspect the exported `data` (SlashCommandBuilder)
 * and mock the Discord interaction to verify `execute` calls deferReply and
 * editReply with an embed that contains the expected content.
 */

import { data, execute } from "../src/commands/user/help";
import { ChatInputCommandInteraction, Client } from "discord.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildMockInteraction(): jest.Mocked<ChatInputCommandInteraction> {
  return {
    deferReply: jest.fn().mockResolvedValue(undefined),
    editReply: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<ChatInputCommandInteraction>;
}

// ---------------------------------------------------------------------------
// Tests — command metadata
// ---------------------------------------------------------------------------

describe("help command — data export", () => {
  it("has the correct command name", () => {
    expect(data.name).toBe("help");
  });

  it("has a non-empty description", () => {
    expect(data.description.length).toBeGreaterThan(0);
  });

  it("has no options (no user input required)", () => {
    const json = data.toJSON();
    expect(json.options ?? []).toHaveLength(0);
  });

  it("does not set default member permissions (visible to all)", () => {
    const json = data.toJSON();
    // setDefaultMemberPermissions is not called, so the field is absent or null
    expect(json.default_member_permissions ?? null).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Tests — execute behaviour
// ---------------------------------------------------------------------------

describe("help command — execute", () => {
  let interaction: jest.Mocked<ChatInputCommandInteraction>;

  beforeEach(() => {
    interaction = buildMockInteraction();
  });

  it("defers the reply as ephemeral", async () => {
    await execute(interaction, {} as Client);
    expect(interaction.deferReply).toHaveBeenCalledTimes(1);
    // discord.js v14 convention: MessageFlags.Ephemeral (64) rather than deprecated ephemeral: true
    expect(interaction.deferReply).toHaveBeenCalledWith({ flags: 64 });
  });

  it("calls editReply exactly once", async () => {
    await execute(interaction, {} as Client);
    expect(interaction.editReply).toHaveBeenCalledTimes(1);
  });

  it("replies with exactly one embed", async () => {
    await execute(interaction, {} as Client);
    const call = interaction.editReply.mock.calls[0][0] as { embeds: unknown[] };
    expect(call.embeds).toHaveLength(1);
  });

  it("embed title contains 'Discord Watchtower'", async () => {
    await execute(interaction, {} as Client);
    const call = interaction.editReply.mock.calls[0][0] as { embeds: Array<{ toJSON(): Record<string, unknown> }> };
    const embedJson = call.embeds[0].toJSON() as { title: string };
    expect(embedJson.title).toContain("Discord Watchtower");
  });

  it("embed description mentions PIM", async () => {
    await execute(interaction, {} as Client);
    const call = interaction.editReply.mock.calls[0][0] as { embeds: Array<{ toJSON(): Record<string, unknown> }> };
    const embedJson = call.embeds[0].toJSON() as { description: string };
    expect(embedJson.description).toContain("PIM");
  });

  it("embed fields cover all eight commands", async () => {
    await execute(interaction, {} as Client);
    const call = interaction.editReply.mock.calls[0][0] as { embeds: Array<{ toJSON(): Record<string, unknown> }> };
    const embedJson = call.embeds[0].toJSON() as { fields: Array<{ name: string; value: string }> };

    const allText = embedJson.fields.map((f) => f.value).join("\n");

    const expectedCommands = [
      "/set-password",
      "/elevate",
      "/help",
      "/watchtower-assign",
      "/watchtower-revoke",
      "/watchtower-list",
      "/watchtower-unlock",
      "/watchtower-config",
    ];

    for (const cmd of expectedCommands) {
      expect(allText).toContain(cmd);
    }
  });

  it("embed has exactly three fields (Getting Started, User Commands, Admin Commands)", async () => {
    await execute(interaction, {} as Client);
    const call = interaction.editReply.mock.calls[0][0] as { embeds: Array<{ toJSON(): Record<string, unknown> }> };
    const embedJson = call.embeds[0].toJSON() as { fields: Array<{ name: string }> };
    expect(embedJson.fields).toHaveLength(3);
  });

  it("Getting Started field mentions /set-password, /watchtower-assign, and /elevate", async () => {
    await execute(interaction, {} as Client);
    const call = interaction.editReply.mock.calls[0][0] as { embeds: Array<{ toJSON(): Record<string, unknown> }> };
    const embedJson = call.embeds[0].toJSON() as { fields: Array<{ name: string; value: string }> };
    const gettingStarted = embedJson.fields.find((f) => f.name.includes("Getting Started"));
    expect(gettingStarted).toBeDefined();
    expect(gettingStarted!.value).toContain("/set-password");
    expect(gettingStarted!.value).toContain("/watchtower-assign");
    expect(gettingStarted!.value).toContain("/elevate");
  });

  it("Admin Commands field mentions required role", async () => {
    await execute(interaction, {} as Client);
    const call = interaction.editReply.mock.calls[0][0] as { embeds: Array<{ toJSON(): Record<string, unknown> }> };
    const embedJson = call.embeds[0].toJSON() as { fields: Array<{ name: string; value: string }> };
    const adminField = embedJson.fields.find((f) => f.name.includes("Admin"));
    expect(adminField).toBeDefined();
    expect(adminField!.value.toLowerCase()).toContain("watchtower admin role");
  });

  it("embed has a footer indicating ephemeral nature", async () => {
    await execute(interaction, {} as Client);
    const call = interaction.editReply.mock.calls[0][0] as { embeds: Array<{ toJSON(): Record<string, unknown> }> };
    const embedJson = call.embeds[0].toJSON() as { footer: { text: string } };
    expect(embedJson.footer).toBeDefined();
    expect(embedJson.footer.text).toBeTruthy();
  });

  it("does not make any database calls", async () => {
    // If no DB module is imported at all, this is implicitly verified.
    // Explicit check: the module source should not reference prisma.
    const fs = require("fs");
    const path = require("path");
    const source: string = fs.readFileSync(
      path.resolve(__dirname, "../src/commands/user/help.ts"),
      "utf-8"
    );
    expect(source).not.toContain("prisma");
    expect(source).not.toContain("db.");
    expect(source).not.toContain("database");
  });

  it("does not call getOrCreateGuildConfig", async () => {
    const fs = require("fs");
    const path = require("path");
    const source: string = fs.readFileSync(
      path.resolve(__dirname, "../src/commands/user/help.ts"),
      "utf-8"
    );
    expect(source).not.toContain("getOrCreateGuildConfig");
  });
});
