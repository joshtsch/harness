import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { parse } from "yaml";
import { claudePluginInstallCommands, claudePluginSkills, enabledClaudePluginPaths, installedClaudePluginIds, requiredClaudePlugins } from "../src/claude-plugins.js";

afterEach(() => {
  vi.doUnmock("node:child_process");
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("Claude plugins", () => {
  it("requires enabled plugins and records their non-official marketplaces", () => {
    const required = requiredClaudePlugins({
      enabledPlugins: { "ponytail@ponytail": true, "vercel@claude-plugins-official": true, "old@claude-plugins-official": false },
      extraKnownMarketplaces: { ponytail: { source: { source: "github", repo: "DietrichGebert/ponytail" } } },
    });
    expect(required).toEqual([{ id: "ponytail@ponytail", marketplaceRepository: "DietrichGebert/ponytail" }, { id: "vercel@claude-plugins-official" }]);
    expect(claudePluginInstallCommands(required, "/repo")).toEqual([
      "cd '/repo'",
      "claude plugin marketplace add DietrichGebert/ponytail",
      "claude plugin install ponytail@ponytail --scope project",
      "claude plugin install vercel@claude-plugins-official --scope project",
    ]);
    expect(() => requiredClaudePlugins({ enabledPlugins: { ponytail: true } })).toThrow("plugin@marketplace");
  });

  it("reads installed plugin ids from either JSON list shape", () => {
    expect(installedClaudePluginIds("[]", "/repo")).toEqual(new Set());
    expect(installedClaudePluginIds('[{"pluginId":"Vercel@claude-plugins-official"}]', "/repo")).toEqual(new Set(["vercel@claude-plugins-official"]));
    expect(installedClaudePluginIds('[{"pluginId":"ponytail@ponytail","enabled":false}]', "/repo")).toEqual(new Set());
    expect(installedClaudePluginIds('{"installed":[{"id":"ponytail@ponytail"}],"available":[{"pluginId":"x@y"}]}', "/repo")).toEqual(new Set(["ponytail@ponytail"]));
  });

  it("counts project and local installs only for their own folder", () => {
    const list = JSON.stringify([
      { id: "a@m", scope: "project", projectPath: "/repo" },
      { id: "b@m", scope: "project", projectPath: "/repo/projects" },
      { id: "c@m", scope: "local", projectPath: "/repo/projects/" },
      { id: "d@m", scope: "user" },
    ]);
    expect(installedClaudePluginIds(list, "/repo")).toEqual(new Set(["a@m", "d@m"]));
    expect(installedClaudePluginIds(list, "/repo/projects")).toEqual(new Set(["b@m", "c@m", "d@m"]));
  });

  it("selects enabled plugins installed for the project root or user", () => {
    const settings = { enabledPlugins: { "a@m": true, "b@m": true, "c@m": true, "d@m": false } };
    const list = JSON.stringify([
      { id: "a@m", scope: "project", projectPath: "/repo", installPath: "/cache/a" },
      { id: "b@m", scope: "project", projectPath: "/repo/projects", installPath: "/cache/b" },
      { id: "c@m", scope: "user", installPath: "/cache/c" },
      { id: "d@m", scope: "user", installPath: "/cache/d" },
      { id: "e@m", scope: "user", installPath: "/cache/e" },
      { id: "a@m", scope: "local", projectPath: "/repo", enabled: false, installPath: "/cache/a-off" },
    ]);
    expect(enabledClaudePluginPaths(settings, list, "/repo")).toEqual(["/cache/a", "/cache/c"]);
  });

  it("quotes the install folder for the shell", () => {
    expect(claudePluginInstallCommands([{ id: "a@m" }], "/it's $HOME")[0]).toBe("cd '/it'\\''s $HOME'");
  });

  it("verifies plugins against installs for the settings file's folder", async () => {
    const root = await mkdtemp(join(tmpdir(), "harness-claude-verify-"));
    try {
      await mkdir(join(root, "projects/.claude"), { recursive: true });
      const settingsPath = join(root, "projects/.claude/settings.json");
      await writeFile(settingsPath, JSON.stringify({ enabledPlugins: { "a@m": true } }));
      const list = JSON.stringify([{ id: "a@m", scope: "project", projectPath: root }]);
      vi.doMock("node:child_process", () => ({ execFile: (_command: string, _args: string[], _options: unknown, callback: (error: Error | null, result: { stdout: string; stderr: string }) => void) => callback(null, { stdout: list, stderr: "" }) }));
      vi.spyOn(console, "log").mockImplementation(() => {});
      const { verifyClaudePlugins } = await import("../src/claude-plugins.js");
      await expect(verifyClaudePlugins(settingsPath)).rejects.toThrow(`missing Claude plugins for ${join(root, "projects")}; install with:\ncd '${join(root, "projects")}'`);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("lists skills from the default directory and manifest paths", async () => {
    const root = await mkdtemp(join(tmpdir(), "harness-claude-plugin-"));
    try {
      for (const skill of ["skills/top", "skills/group/nested", "extra/one", "more/two"]) {
        await mkdir(join(root, skill), { recursive: true });
        await writeFile(join(root, skill, "SKILL.md"), "---\n---\n");
      }
      await mkdir(join(root, ".claude-plugin"));
      await writeFile(join(root, ".claude-plugin/plugin.json"), JSON.stringify({ skills: ["./extra/one", "./more"] }));
      expect(await claudePluginSkills(root)).toEqual(["one", "top", "two"]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("enables the same approved plugins as Codex", async () => {
    const repository = resolve(import.meta.dirname, "..");
    const settings = JSON.parse(await readFile(resolve(repository, ".claude/settings.json"), "utf8"));
    const codex = parse(await readFile(resolve(repository, ".codex/plugins.yml"), "utf8")) as { plugins: Array<{ name: string }> };
    // Codex installs these plugins' skills from skills-lock.json instead.
    const claudeOnly = ["mattpocock-skills"];
    const claudeNames = requiredClaudePlugins(settings).map(({ id }) => id.split("@")[0]!).filter((name) => !claudeOnly.includes(name)).sort();
    expect(claudeNames).toEqual(codex.plugins.map(({ name }) => name).sort());
  });
});
