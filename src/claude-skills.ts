import { access, lstat, mkdir, readFile, readdir, readlink, realpath, symlink, unlink } from "node:fs/promises";
import { resolve } from "node:path";
import type { CapabilityPolicy } from "./capability-policy.js";

export function verifyClaudeContext(contents: string): void {
  if (!/^@AGENTS\.md\s*$/m.test(contents)) throw new Error("CLAUDE.md must import AGENTS.md with @AGENTS.md");
}

// Skills an enabled Claude plugin bundles are disabled so Claude loads only the plugin's copy.
export function claudeSkillNames(policy: CapabilityPolicy, pluginSkills: ReadonlySet<string> = new Set()): { enabled: string[]; disabled: string[] } {
  const enabled: string[] = [];
  const disabled: string[] = [];
  for (const [name, route] of Object.entries(policy.skills)) {
    (route.state === "canonical" && route.providers.claude !== "unavailable" && !pluginSkills.has(name) ? enabled : disabled).push(name);
  }
  return { enabled: enabled.sort(), disabled: disabled.sort() };
}

function missing(error: unknown): boolean {
  return error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT";
}

export async function syncClaudeProjectSkills(root: string, policy: CapabilityPolicy, pluginSkills: ReadonlySet<string> = new Set()): Promise<{ linked: string[]; removed: string[] }> {
  verifyClaudeContext(await readFile(resolve(root, "CLAUDE.md"), "utf8"));
  const sourceRoot = resolve(root, ".agents", "skills");
  const destinationRoot = resolve(root, ".claude", "skills");
  await mkdir(destinationRoot, { recursive: true });
  const { enabled, disabled } = claudeSkillNames(policy, pluginSkills);
  const linked: string[] = [];
  const removed: string[] = [];

  for (const name of enabled) {
    const source = resolve(sourceRoot, name);
    const destination = resolve(destinationRoot, name);
    await access(resolve(source, "SKILL.md"));
    try {
      await lstat(destination);
    } catch (error) {
      if (!missing(error)) throw error;
      await symlink(source, destination, "junction");
      linked.push(name);
      continue;
    }
    const [actual, expected] = await Promise.all([realpath(destination).catch(() => undefined), realpath(source)]);
    if (actual !== expected) throw new Error(`Claude skill destination conflicts with another installation: ${destination}`);
  }

  const enabledNames = new Set(enabled);
  const disabledNames = new Set(disabled);
  for (const entry of await readdir(destinationRoot, { withFileTypes: true })) {
    if (enabledNames.has(entry.name)) continue;
    const destination = resolve(destinationRoot, entry.name);
    const harnessLink = entry.isSymbolicLink() && resolve(destinationRoot, await readlink(destination)) === resolve(sourceRoot, entry.name);
    if (harnessLink) {
      await unlink(destination);
      removed.push(entry.name);
    } else if (disabledNames.has(entry.name)) {
      throw new Error(`${entry.name} must be disabled for Claude; remove ${destination}`);
    }
  }
  return { linked, removed: removed.sort() };
}
