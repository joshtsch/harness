import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { claudePluginInstallCommands, installedClaudePluginIds, requiredClaudePlugins } from "../src/claude-plugins.js";

describe("Claude plugins", () => {
  it("requires enabled plugins and records their non-official marketplaces", () => {
    const required = requiredClaudePlugins({
      enabledPlugins: { "ponytail@ponytail": true, "vercel@claude-plugins-official": true, "old@claude-plugins-official": false },
      extraKnownMarketplaces: { ponytail: { source: { source: "github", repo: "DietrichGebert/ponytail" } } },
    });
    expect(required).toEqual([{ id: "ponytail@ponytail", marketplaceRepository: "DietrichGebert/ponytail" }, { id: "vercel@claude-plugins-official" }]);
    expect(claudePluginInstallCommands(required)).toEqual([
      "claude plugin marketplace add DietrichGebert/ponytail",
      "claude plugin install ponytail@ponytail --scope project",
      "claude plugin install vercel@claude-plugins-official --scope project",
    ]);
    expect(() => requiredClaudePlugins({ enabledPlugins: { ponytail: true } })).toThrow("plugin@marketplace");
  });

  it("reads installed plugin ids from either JSON list shape", () => {
    expect(installedClaudePluginIds("[]")).toEqual(new Set());
    expect(installedClaudePluginIds('[{"pluginId":"Vercel@claude-plugins-official"}]')).toEqual(new Set(["vercel@claude-plugins-official"]));
    expect(installedClaudePluginIds('[{"pluginId":"ponytail@ponytail","enabled":false}]')).toEqual(new Set());
    expect(installedClaudePluginIds('{"installed":[{"id":"ponytail@ponytail"}],"available":[{"pluginId":"x@y"}]}')).toEqual(new Set(["ponytail@ponytail"]));
  });

  it("enables the same approved plugins as Codex", async () => {
    const repository = resolve(import.meta.dirname, "..");
    const settings = JSON.parse(await readFile(resolve(repository, ".claude/settings.json"), "utf8"));
    const codex = parse(await readFile(resolve(repository, ".codex/plugins.yml"), "utf8")) as { plugins: Array<{ name: string }> };
    const claudeNames = requiredClaudePlugins(settings).map(({ id }) => id.split("@")[0]).sort();
    expect(claudeNames).toEqual(codex.plugins.map(({ name }) => name).sort());
  });
});
