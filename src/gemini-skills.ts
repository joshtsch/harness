import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";
import type { CapabilityPolicy } from "./capability-policy.js";

const execFileAsync = promisify(execFile);

export function verifyGeminiContextSettings(settings: unknown): void {
  const names = (settings as { context?: { fileName?: unknown } } | null)?.context?.fileName;
  if (!Array.isArray(names) || !names.includes("AGENTS.md")) throw new Error("Gemini project context must load AGENTS.md");
}

export function geminiSkillPolicyDrift(output: string, root: string, policy: CapabilityPolicy): string[] {
  const discovered = new Map<string, { enabled: boolean; location?: string }>();
  let current: string | undefined;
  for (const line of output.split(/\r?\n/)) {
    const heading = /^([a-z0-9-]+) \[(Enabled|Disabled)\]$/.exec(line);
    if (heading) {
      current = heading[1];
      discovered.set(current!, { enabled: heading[2] === "Enabled" });
      continue;
    }
    const location = /^\s+Location:\s+(.+)$/.exec(line);
    if (current && location) discovered.get(current)!.location = location[1];
  }
  return Object.entries(policy.skills).flatMap(([name, route]) => {
    const skill = discovered.get(name);
    const shouldEnable = route.state === "canonical" && route.providers.gemini !== "unavailable";
    if (shouldEnable && (!skill?.enabled || skill.location !== resolve(root, ".agents/skills", name, "SKILL.md"))) return [`${name} must be enabled from this project`];
    if (!shouldEnable && skill?.enabled) return [`${name} must be disabled`];
    return [];
  });
}

export async function verifyGeminiProjectSkills(root: string, policy: CapabilityPolicy): Promise<void> {
  verifyGeminiContextSettings(JSON.parse(await readFile(resolve(root, ".gemini/settings.json"), "utf8")));
  const { stdout } = await execFileAsync("gemini", ["skills", "list"], { cwd: root, maxBuffer: 1024 * 1024 });
  const drift = geminiSkillPolicyDrift(stdout, root, policy);
  if (drift.length) throw new Error(`Gemini skill policy drift: ${drift.join(", ")}`);
}
