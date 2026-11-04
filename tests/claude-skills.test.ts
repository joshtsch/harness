import { lstat, mkdir, mkdtemp, readFile, readlink, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { claudeSkillNames, syncClaudeProjectSkills, verifyClaudeContext } from "../src/claude-skills.js";
import type { CapabilityPolicy } from "../src/capability-policy.js";

const policy = {
  skills: {
    active: { state: "canonical", providers: { claude: "supported" } },
    ignored: { state: "canonical", providers: { claude: "unavailable" } },
    dependency: { state: "available", providers: { claude: "supported" } },
  },
} as unknown as CapabilityPolicy;

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

async function fixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "harness-claude-test-"));
  roots.push(root);
  await writeFile(join(root, "CLAUDE.md"), "@AGENTS.md\n");
  for (const name of ["active", "ignored", "dependency"]) {
    await mkdir(join(root, ".agents/skills", name), { recursive: true });
    await writeFile(join(root, ".agents/skills", name, "SKILL.md"), `---\nname: ${name}\n---\n`);
  }
  return root;
}

describe("Claude skill discovery", () => {
  it("requires CLAUDE.md to import the shared agent instructions", () => {
    expect(() => verifyClaudeContext("@AGENTS.md\n")).not.toThrow();
    expect(() => verifyClaudeContext("See AGENTS.md\n")).toThrow("must import AGENTS.md");
  });

  it("enables only canonical skills Claude supports", () => {
    expect(claudeSkillNames(policy)).toEqual({ enabled: ["active"], disabled: ["dependency", "ignored"] });
  });

  it("removes harness links for skills an enabled plugin provides", async () => {
    const root = await fixture();
    expect(await syncClaudeProjectSkills(root, policy)).toEqual({ linked: ["active"], removed: [] });
    expect(await syncClaudeProjectSkills(root, policy, new Set(["active"]))).toEqual({ linked: [], removed: ["active"] });
    await expect(lstat(join(root, ".claude/skills/active"))).rejects.toThrow();
  });

  it("links enabled project skills and removes stale harness links", async () => {
    const root = await fixture();
    await mkdir(join(root, ".claude/skills"), { recursive: true });
    await symlink("../../.agents/skills/ignored", join(root, ".claude/skills/ignored"));

    expect(await syncClaudeProjectSkills(root, policy)).toEqual({ linked: ["active"], removed: ["ignored"] });
    expect(await readlink(join(root, ".claude/skills/active"))).toBe(join(root, ".agents/skills/active"));
    await expect(lstat(join(root, ".claude/skills/ignored"))).rejects.toThrow();
    expect(await syncClaudeProjectSkills(root, policy)).toEqual({ linked: [], removed: [] });
  });

  it("removes harness links for skills no longer in policy", async () => {
    const root = await fixture();
    await mkdir(join(root, ".claude/skills"), { recursive: true });
    await symlink(join(root, ".agents/skills/dropped"), join(root, ".claude/skills/dropped"));
    expect(await syncClaudeProjectSkills(root, policy)).toEqual({ linked: ["active"], removed: ["dropped"] });
  });

  it("reports a dangling destination as a conflict", async () => {
    const root = await fixture();
    await mkdir(join(root, ".claude/skills"), { recursive: true });
    await symlink(join(root, "missing"), join(root, ".claude/skills/active"));
    await expect(syncClaudeProjectSkills(root, policy)).rejects.toThrow("conflicts with another installation");
  });

  it("preserves skills it did not install", async () => {
    const root = await fixture();
    await mkdir(join(root, ".claude/skills/user-skill"), { recursive: true });
    await mkdir(join(root, ".claude/skills/ignored"), { recursive: true });
    await expect(syncClaudeProjectSkills(root, policy)).rejects.toThrow("ignored must be disabled for Claude");
    await expect(lstat(join(root, ".claude/skills/user-skill"))).resolves.toBeDefined();
    const conflicted = await fixture();
    await mkdir(join(conflicted, ".claude/skills/active"), { recursive: true });
    await expect(syncClaudeProjectSkills(conflicted, policy)).rejects.toThrow("conflicts with another installation");
  });

  it("keeps the checked-in Claude context and MCP servers aligned with Codex", async () => {
    const repository = resolve(import.meta.dirname, "..");
    verifyClaudeContext(await readFile(resolve(repository, "CLAUDE.md"), "utf8"));
    const codex = await readFile(resolve(repository, ".codex/config.toml"), "utf8");
    const expected = Object.fromEntries([...codex.matchAll(/^\[mcp_servers\.([a-z0-9-]+)\]\s*\nurl = "([^"]+)"$/gm)]
      .map(([, name, url]) => [name, { type: "http", url }]));
    const claude = JSON.parse(await readFile(resolve(repository, ".mcp.json"), "utf8"));
    expect(claude.mcpServers).toEqual(expected);
  });
});
