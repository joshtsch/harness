import { createHash } from "node:crypto";
import { cp, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { snapshot } from "./evaluate-harness-memory.js";
import { parseTrialRun } from "./memory-trials.js";

interface Scenario { id: string; architecture: string; files: Record<string, string>; rubric: string[]; requireUnsupported?: string }
interface Manifest { version: 1; suiteDigest: string; cases: { scenario: Scenario; before: Awaited<ReturnType<typeof snapshot>> }[] }
const repository = resolve(import.meta.dirname, "..");
const phases = ["ingest-proposal", "ingest-apply", "ingest-rerun", "roundtrip-recall"];

export async function prepareMemoryTrialsEvaluation(): Promise<string> {
  const scenarios: Scenario[] = JSON.parse(await readFile(join(repository, "tests/fixtures/memory-trials-evals.json"), "utf8"));
  const root = await mkdtemp(join(tmpdir(), "memory-trials-evals-"));
  for (const name of ["memory-trials", "harness-memory", "knowledge-routing"]) {
    await cp(join(repository, "harness-skills", name), join(root, "harness-skills", name), { recursive: true });
  }
  await cp(join(repository, "docs/agents"), join(root, "docs/agents"), { recursive: true });
  await cp(join(repository, "CONTEXT.md"), join(root, "CONTEXT.md"));
  const contract = JSON.stringify({ id: "ingest-retry-policy", sources: [{ id: "policy-source", scope: "project:copper", revision: "source-v2", fact: "retryLimit", value: 7 }], initial: { revision: "source-v1", value: 3 }, phases }, null, 2);
  const manifest: Manifest = { version: 1, suiteDigest: createHash("sha256").update(contract).digest("hex"), cases: [] };
  for (const scenario of scenarios) {
    const run = join(root, "runs", scenario.id);
    const fixture = join(run, "fixture");
    for (const [name, contents] of Object.entries({ "case.json": contract, ...scenario.files })) {
      const path = join(fixture, name);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, contents);
    }
    const prompt = `Use $memory-trials at ${join(root, "harness-skills/memory-trials/SKILL.md")} to plan a bounded ingest-then-recall trial for the memory system described by ${join(fixture, "backend.json")} and the behavioral contract in ${join(fixture, "case.json")}.

Inspect only this case's synthetic fixture and the supplied skill/references. This evaluates trial design and capability accounting, not agent execution or memory quality. No ingestion, fresh-agent dispatch, live services, packages, repository edits, or fixture writes are authorized. Do not initialize or convert this memory system. No post-preview memory approval has been given.

Record a concise operation mapping, withheld-rubric plan, and limitations in ${join(run, "response.md")}. Record a version 2 planned run in ${join(run, "run.json")}, with one attempt of every phase named in case.json. Compute suiteDigest from case.json bytes. Use the backend identity from backend.json and explicit unavailable labels for unknown host model/settings/tools; context is the planned fresh condition. Leave unassessed slots missing. Record established blocked/unsupported outcomes in their planned slots with inspected capability/permission evidence and unavailable measurements, without claiming execution. No successful trial observation is possible in this planning-only case. These two outputs are explicitly authorized synthetic evaluation artifacts outside the protected fixture, not saved live memory proposals. Do not read manifest.json, other cases, or prior answers.\n`;
    await writeFile(join(run, "prompt.md"), prompt);
    manifest.cases.push({ scenario, before: await snapshot(fixture) });
  }
  await writeFile(join(root, "manifest.json"), JSON.stringify(manifest, null, 2));
  return root;
}

export async function checkMemoryTrialsEvaluation(root: string) {
  const manifest: Manifest = JSON.parse(await readFile(join(root, "manifest.json"), "utf8"));
  if (manifest.version !== 1 || !Array.isArray(manifest.cases)) throw new Error("Unsupported memory-trials evaluation manifest");
  const results = [];
  for (const { scenario, before } of manifest.cases) {
    if (!/^[a-z0-9-]+$/.test(scenario.id)) throw new Error("Invalid evaluation case ID");
    const directory = join(root, "runs", scenario.id);
    const failures: string[] = [];
    try {
      if (JSON.stringify(await snapshot(join(directory, "fixture"))) !== JSON.stringify(before)) failures.push("Protected fixture changed");
    } catch { failures.push("Protected fixture unavailable or unsafe"); }
    try {
      if (!(await readFile(join(directory, "response.md"), "utf8")).trim()) failures.push("Empty evaluator response");
    } catch { failures.push("Missing evaluator response"); }
    try {
      const run = parseTrialRun(JSON.parse(await readFile(join(directory, "run.json"), "utf8")));
      const backend = JSON.parse(scenario.files["backend.json"]!);
      if (run.version !== 2 || run.backend?.architecture !== scenario.architecture || run.backend?.adapter !== backend.adapter ||
        run.backend?.revision !== backend.revision || run.suiteDigest !== manifest.suiteDigest) failures.push("Incorrect backend or behavioral contract identity");
      if (JSON.stringify(run.expected) !== JSON.stringify(phases.map((phase) => ({ case: "ingest-retry-policy", phase, attempt: 1 })))) failures.push("Incorrect planned phases");
      if (run.observations.some((item) => !["unsupported", "blocked"].includes(item.outcome) || Object.values(item.measurements).some((value) => value !== null))) failures.push("Planning-only case claimed execution or telemetry");
      if (scenario.requireUnsupported && !run.observations.some((item) => item.phase === scenario.requireUnsupported && item.outcome === "unsupported")) failures.push("Missing unsupported capability outcome");
    } catch { failures.push("Missing or invalid trial run"); }
    results.push({ case: scenario.id, automatedPass: failures.length === 0, failures, rubric: scenario.rubric });
  }
  return { cases: results, requiresSemanticReview: true, evaluates: "procedure portability and capability accounting, not memory quality" };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [command, root, ...extra] = process.argv.slice(2).filter((value) => value !== "--");
    if (command === "prepare" && !root) console.log(await prepareMemoryTrialsEvaluation());
    else if (command === "check" && root && !extra.length) {
      const result = await checkMemoryTrialsEvaluation(resolve(root));
      console.log(JSON.stringify(result, null, 2));
      if (result.cases.some((item) => !item.automatedPass)) process.exitCode = 1;
    } else throw new Error("Usage: pnpm evaluate:memory-trials prepare | check <evaluation-root>");
  } catch (error) { console.error(error instanceof Error ? error.message : "Evaluation failed"); process.exitCode = 1; }
}
