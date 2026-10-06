import { resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { loadRequiredPlugins, verifyRequiredPlugins } from "../src/codex-plugins.js";
import { verifyProjectSkills } from "../src/project-skills.js";
import { loadCapabilityPolicy, verifyCapabilityInventory } from "../src/capability-policy.js";
import { verifyGeminiProjectSkills } from "../src/gemini-skills.js";
import { parseAgentProviderArgs, prerequisitesForProvider, verifyPrerequisites } from "../src/prerequisites.js";

const repoRoot = resolve(import.meta.dirname, "..");
const execFileAsync = promisify(execFile);
const provider = parseAgentProviderArgs(process.argv.slice(2), "Usage: pnpm init:harness [--provider codex|gemini]");

async function run(): Promise<void> {
  const stages: Array<[string, () => Promise<void>]> = [
    ["prerequisites", async () => verifyPrerequisites(prerequisitesForProvider(provider))],
    ["project skills", async () => {
      await execFileAsync("pnpm", ["dlx", "skills", "experimental_install"], { cwd: repoRoot });
      await verifyProjectSkills(repoRoot, resolve(repoRoot, "skills-lock.json"));
      const policy = await loadCapabilityPolicy(resolve(repoRoot, "capabilities.yml"), resolve(repoRoot, "agent-policy.yml"));
      await verifyCapabilityInventory(policy, resolve(repoRoot, "skills-lock.json"));
      if (provider === "gemini") await verifyGeminiProjectSkills(repoRoot, policy);
    }],
    ...(provider === "codex" ? [["codex plugins", async () => verifyRequiredPlugins(await loadRequiredPlugins(resolve(repoRoot, ".codex/plugins.yml")))]] as Array<[string, () => Promise<void>]> : []),
  ];

  for (const [name, stage] of stages) {
    console.log(`init: ${name}`);
    await stage();
  }
  console.log("init: complete");
}

run().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
