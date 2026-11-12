import { cp, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { snapshot } from "./evaluate-harness-memory.js";

interface Scenario { id: string; task: string; files?: Record<string, string>; minRows: number; rubric: string[] }
interface Fixture { base?: Record<string, string>; cases: Scenario[] }
type Snapshot = Awaited<ReturnType<typeof snapshot>>;
interface Manifest { version: 1; skill: RoutingSkill; cases: { scenario: Scenario; before: Snapshot }[]; skillWords: number; skillBytes: number }

// Each routing skill only suggests, so every case leaves its workspace unchanged and is scored on its report table.
const skills = {
  "enforcement-routing": {
    companion: "knowledge-routing",
    harnessFiles: [] as string[],
    columns: [/harm point/i, /floor/i],
    subject: "Repository under review",
    note: "Its own settings, hooks, workflows, and package scripts are the existing enforcement inventory; the linked harness documentation describes the method, not this repository.",
  },
  "knowledge-routing": {
    companion: "enforcement-routing",
    harnessFiles: ["AGENTS.md", "CONTEXT.md", "docs/agents", "docs/adr", "harness-skills", "package.json", ".claude/settings.json", "scripts/claude-hooks", ".github/workflows"],
    columns: [/context layer/i, /activation path/i],
    subject: "Harness snapshot under review",
    note: "Treat it as the harness root: its guidance, skills, package scripts, hooks, workflows, and any other files are the existing sources to inspect, and its files override the skill's linked copies where they differ.",
  },
};
export type RoutingSkill = keyof typeof skills;

const repository = resolve(import.meta.dirname, "..");

export async function prepareRoutingEvaluation(skillDirectory: string): Promise<string> {
  const skill = resolve(skillDirectory);
  const name = basename(skill);
  if (!(name in skills)) throw new Error(`Select one of: ${Object.keys(skills).join(", ")}`);
  const config = skills[name as RoutingSkill];
  const sourceRoot = resolve(skill, "../..");
  const root = await mkdtemp(join(tmpdir(), `${name}-evals-`));
  await cp(skill, join(root, "harness-skills", name), { recursive: true });
  await cp(join(sourceRoot, "harness-skills", config.companion), join(root, "harness-skills", config.companion), { recursive: true });
  await cp(join(sourceRoot, "docs/agents"), join(root, "docs/agents"), { recursive: true });
  const fixture: Fixture = JSON.parse(await readFile(join(repository, `tests/fixtures/${name}-evals.json`), "utf8"));
  const cases: Manifest["cases"] = [];
  for (const scenario of fixture.cases) {
    const run = join(root, "runs", scenario.id);
    const workspace = join(run, "workspace");
    for (const path of config.harnessFiles) await cp(join(sourceRoot, path), join(workspace, path), { recursive: true });
    for (const [file, contents] of Object.entries({ ...fixture.base, ...scenario.files })) {
      const target = resolve(workspace, file);
      if (!target.startsWith(`${workspace}${sep}`)) throw new Error("Fixture path escapes its workspace");
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, contents);
    }
    const prompt = `Use $${name} at ${join(root, "harness-skills", name, "SKILL.md")} for the following request.\n\n${scenario.task}\n\n${config.subject}: ${workspace}\n${config.note} This is a disposable synthetic fixture. Leave the workspace completely unchanged. Record your full report, including the report table, in ${join(run, "response.md")}. Record any confirmation questions there rather than calling user-input tools. Do not inspect the evaluation manifest or other cases. No external actions or harness edits.\n`;
    await writeFile(join(run, "prompt.md"), prompt);
    cases.push({ scenario, before: await snapshot(workspace) });
  }
  const contents = await readFile(join(skill, "SKILL.md"), "utf8");
  const manifest: Manifest = { version: 1, skill: name as RoutingSkill, cases, skillWords: contents.trim().split(/\s+/).length, skillBytes: Buffer.byteLength(contents) };
  await writeFile(join(root, "manifest.json"), JSON.stringify(manifest, null, 2));
  return root;
}

// Counts data rows in the first table whose header matches every report column.
export function reportRows(response: string, columns: RegExp[]): number | undefined {
  const lines = response.split("\n").map((line) => line.trim());
  const header = lines.findIndex((line) => line.startsWith("|") && columns.every((column) => column.test(line)));
  if (header === -1 || !/^\|[\s:|-]+\|$/.test(lines[header + 1] ?? "")) return undefined;
  let rows = 0;
  while (lines[header + 2 + rows]?.startsWith("|")) rows++;
  return rows;
}

export async function checkRoutingEvaluation(root: string) {
  const manifest: Manifest = JSON.parse(await readFile(join(root, "manifest.json"), "utf8"));
  if (manifest.version !== 1 || !Array.isArray(manifest.cases) || !(manifest.skill in skills)) throw new Error("Unsupported evaluation manifest");
  const { columns } = skills[manifest.skill];
  const results = [];
  for (const { scenario, before } of manifest.cases) {
    if (!/^[a-z0-9-]+$/.test(scenario.id)) throw new Error("Invalid evaluation case ID");
    const run = join(root, "runs", scenario.id);
    const after = await snapshot(join(run, "workspace"));
    const failures: string[] = [];
    for (const [name, entry] of Object.entries(before)) {
      if (JSON.stringify(after[name]) !== JSON.stringify(entry)) failures.push(`Changed workspace path: ${name}`);
    }
    if (Object.keys(after).some((name) => !before[name])) failures.push("Created workspace paths");
    try {
      const rows = reportRows(await readFile(join(run, "response.md"), "utf8"), columns);
      if (rows === undefined) failures.push("No report table with the skill's report columns");
      else if (rows < scenario.minRows) failures.push(`Report has ${rows} rows; expected at least ${scenario.minRows}`);
    } catch { failures.push("No evaluator response recorded"); }
    results.push({ case: scenario.id, automatedPass: failures.length === 0, failures, rubric: scenario.rubric });
  }
  return { skill: manifest.skill, skillWords: manifest.skillWords, skillBytes: manifest.skillBytes, cases: results, requiresSemanticReview: true };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [skill, command, argument] = process.argv.slice(2).filter((value) => value !== "--");
  try {
    if (!(skill in skills)) throw new Error(`Unknown routing skill: ${skill}`);
    if (command === "prepare") console.log(await prepareRoutingEvaluation(argument ?? join(repository, "harness-skills", skill)));
    else if (command === "check" && argument) {
      const result = await checkRoutingEvaluation(resolve(argument));
      console.log(JSON.stringify(result, null, 2));
      if (result.cases.some((item) => !item.automatedPass)) process.exitCode = 1;
    }
    else throw new Error(`Usage: pnpm evaluate:${skill} prepare [skill-directory] | check <evaluation-root>`);
  } catch (error) { console.error(error instanceof Error ? error.message : "Evaluation failed"); process.exitCode = 1; }
}
