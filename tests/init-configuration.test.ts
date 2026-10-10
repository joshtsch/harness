import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { loadRequiredPlugins, missingRequiredPlugins } from "../src/codex-plugins.js";
import { loadProjectsConfig } from "../src/project-config.js";

const root = resolve(import.meta.dirname, "..");

describe("Harness initialization configuration", () => {
  it("validates the public configuration without an installation overlay", async () => {
    await expect(loadProjectsConfig(resolve(root, "projects.yml"), { localConfigPath: null })).resolves.toEqual({});
  });

  it("recognizes approved plugins from current Codex discovery and gives accurate missing-plugin guidance", async () => {
    const required = await loadRequiredPlugins(resolve(root, ".codex/plugins.yml"));
    const discovery = [
      "ponytail@ponytail installed, enabled 4.12.0",
      "vercel@openai-curated-remote installed, enabled 0.21.4",
      "supabase@openai-curated-remote installed, enabled 1.0.0",
    ];
    expect(missingRequiredPlugins(required, discovery.join("\n"))).toEqual([]);
    expect(missingRequiredPlugins(required, discovery.slice(0, 2).join("\n"))).toMatchObject([
      { name: "supabase", install: ["codex plugin add supabase@openai-curated-remote"] },
    ]);
  });

  it("keeps the save clone source separate from its slash-containing ref", async () => {
    const lock = JSON.parse(await readFile(resolve(root, "skills-lock.json"), "utf8"));
    expect(lock.skills.save).toMatchObject({
      source: "joshtsch/skills",
      ref: "codex/5-save-session",
      skillPath: ".agents/skills/save/SKILL.md",
    });
  });
});
