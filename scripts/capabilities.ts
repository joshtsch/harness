import { resolve } from "node:path";
import { decideCapability, loadCapabilityPolicy, recordCapabilityUsage, routeCapability, routeMode, routeSkill, verifyCapabilityInventory } from "../src/capability-policy.js";

const root = resolve(import.meta.dirname, "..");
const [command, provider, primary, ...rest] = process.argv.slice(2).filter((arg) => arg !== "--");

async function run(): Promise<void> {
  const policy = await loadCapabilityPolicy(resolve(root, "capabilities.yml"), resolve(root, "agent-policy.yml"));
  await verifyCapabilityInventory(policy, resolve(root, "skills-lock.json"));
  if (command === "check") {
    console.log(`Capability policy covers ${Object.keys(policy.skills).length} locked skills.`);
    return;
  }
  if (command === "list") {
    for (const [id, capability] of Object.entries(policy.capabilities)) console.log(`${id}\t${capability.intent}`);
    return;
  }
  if (command === "decide" && provider && primary) {
    const capability = decideCapability(policy, [primary, ...rest].join(" "));
    console.log(JSON.stringify({ provider, capability, skills: routeCapability(policy, provider, capability) }));
    return;
  }
  if (command === "route" && provider && primary) {
    const allowDegraded = rest.includes("--allow-degraded");
    const companions = rest.filter((arg) => !["--allow-degraded", "--json"].includes(arg));
    const skills = routeCapability(policy, provider, primary, companions, allowDegraded);
    console.log(rest.includes("--json") ? JSON.stringify({ provider, capability: primary, skills }) : skills.join("\n"));
    return;
  }
  if (command === "skill" && provider && primary) {
    if (rest.some((arg) => !["--allow-degraded", "--json"].includes(arg))) throw new Error("unknown skill routing option");
    const skills = routeSkill(policy, provider, primary, rest.includes("--allow-degraded"));
    console.log(rest.includes("--json") ? JSON.stringify({ provider, capability: policy.skills[primary]!.capability, skills }) : skills.join("\n"));
    return;
  }
  if (command === "record" && provider && primary) {
    const allowDegraded = rest.includes("--allow-degraded");
    const companions = rest.filter((arg) => arg !== "--allow-degraded");
    await recordCapabilityUsage(policy, provider, primary, resolve(root, "docs/.scratch/capability-usage.jsonl"), companions, allowDegraded);
    console.log("Recorded redacted capability usage.");
    return;
  }
  if (command === "mode" && provider && primary) {
    if (rest.some((arg) => arg !== "--allow-degraded")) throw new Error("unknown mode routing option");
    console.log(routeMode(policy, provider, primary, rest.includes("--allow-degraded")).join("\n"));
    return;
  }
  throw new Error("Usage: pnpm capabilities check|list|decide <provider> <task>|route <provider> <capability> [companion ...] [--allow-degraded]|skill <provider> <skill>|record <provider> <capability>|mode <provider> <mode>");
}

run().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
