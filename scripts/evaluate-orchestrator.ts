import { cp, mkdir, mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

interface Issue { number: number; title: string; labels: string[]; files: string[]; contracts: string[]; blockedBy?: number[]; body: string }
interface Scenario { id: string; issues: string; authorizedFiling: boolean; slices: number[][]; stackedOn: Record<string, number>; skipped: number[]; openQuestions: { blocks: number; filed: boolean }[]; rubric: string[] }
interface Fixture { issueSets: Record<string, Issue[]>; cases: Scenario[] }
interface PlannedIssue { number: number; branch: string; base: string }
interface Session { role: "implementer" | "reviewer"; issue: number; order: number; parked: boolean; storybookPort?: number; brief: string }
interface Plan { slices: { issues: PlannedIssue[] }[]; skipped: { number: number; reason: string }[]; sessions: Session[]; openQuestions: { blocks: number; label: string; parent: number; filed: boolean; title: string }[] }
interface Manifest { version: 1; epic: number; cases: Scenario[] }

const repository = resolve(import.meta.dirname, "..");
const epic = 900;
const waitLine = "Wait first: do nothing until a go message arrives";
const planSchema = `{
  "slices": [{ "issues": [{ "number": 1, "branch": "<branch>", "base": "main or another issue's branch" }] }],
  "skipped": [{ "number": 4, "reason": "<why>" }],
  "sessions": [{ "role": "implementer or reviewer", "issue": 1, "order": 1, "parked": false, "storybookPort": 6101, "brief": "<full brief text>" }],
  "openQuestions": [{ "blocks": 12, "label": "<label>", "parent": ${epic}, "filed": true, "title": "<sub-issue title>" }]
}`;

export async function prepareOrchestratorEvaluation(skillDirectory: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "orchestrator-evals-"));
  await cp(resolve(skillDirectory), join(root, "skills/orchestrator"), { recursive: true });
  const fixture: Fixture = JSON.parse(await readFile(join(repository, "tests/fixtures/orchestrator-evals.json"), "utf8"));
  for (const scenario of fixture.cases) {
    if (!/^[a-z0-9-]+$/.test(scenario.id)) throw new Error("Invalid evaluation case ID");
    const run = join(root, "runs", scenario.id);
    await mkdir(run, { recursive: true });
    await writeFile(join(run, "backlog.json"), JSON.stringify({ project: "ledger-web", epic: { number: epic, title: "Make the UI consistent" }, issues: fixture.issueSets[scenario.issues] }, null, 2));
    const authorization = scenario.authorizedFiling ? "You may file ready-for-human sub-issues of the epic for anything only I can decide." : "Do not file tracker issues during this run.";
    const prompt = `Use $orchestrator at ${join(root, "skills/orchestrator/SKILL.md")}.\n\nUser request: "Run epic #${epic} in ledger-web in auto mode. ${authorization} I'm away until every PR is ready for review."\n\nThis is a disposable synthetic fixture. ${join(run, "backlog.json")} is the backlog-select result and the full text of every issue in the epic; the project has Storybook. Plan only: do not start, message or list sessions, and run no git, gh, pnpm or tracker commands. Write the plan you would act on to ${join(run, "plan.json")} in this shape, recording a sub-issue you would file or propose under openQuestions:\n\n${planSchema}\n\nThen stop. Write nothing else. Do not inspect the evaluation manifest or other cases.\n`;
    await writeFile(join(run, "prompt.md"), prompt);
  }
  const manifest: Manifest = { version: 1, epic, cases: fixture.cases };
  await writeFile(join(root, "manifest.json"), JSON.stringify(manifest, null, 2));
  return root;
}

const same = (a: number[], b: number[]) => a.length === b.length && [...a].sort().join() === [...b].sort().join();

export function checkPlan(scenario: Scenario, plan: Plan, epicNumber = epic): string[] {
  const failures: string[] = [];
  const planned = plan.slices.flatMap((slice, index) => slice.issues.map((issue) => ({ ...issue, slice: index })));
  scenario.slices.forEach((expected, index) => {
    const actual = plan.slices[index]?.issues.map((issue) => issue.number) ?? [];
    if (!same(actual, expected)) failures.push(`Slice ${index + 1} has [${actual}]; expected [${expected}]`);
  });
  if (plan.slices.length !== scenario.slices.length) failures.push(`Plan has ${plan.slices.length} slices; expected ${scenario.slices.length}`);
  for (const issue of planned) {
    const dependency = scenario.stackedOn[String(issue.number)];
    const base = dependency === undefined ? "main" : planned.find((item) => item.number === dependency)?.branch;
    if (issue.base !== base) failures.push(`Issue ${issue.number} has base ${issue.base}; expected ${base}`);
  }
  const skipped = plan.skipped.map((item) => item.number);
  if (!same(skipped, scenario.skipped)) failures.push(`Skipped [${skipped}]; expected [${scenario.skipped}]`);
  if (plan.skipped.some((item) => !item.reason?.trim())) failures.push("A skipped issue has no reason");
  const ports = new Set<number>();
  for (const issue of planned) {
    const implementer = plan.sessions.filter((item) => item.issue === issue.number && item.role === "implementer");
    const reviewer = plan.sessions.filter((item) => item.issue === issue.number && item.role === "reviewer");
    if (implementer.length !== 1 || reviewer.length !== 1) { failures.push(`Issue ${issue.number} needs one implementer and one reviewer`); continue; }
    if (implementer[0].order >= reviewer[0].order) failures.push(`Issue ${issue.number}'s reviewer starts before its implementer`);
    const port = reviewer[0].storybookPort;
    if (!Number.isInteger(port) || ports.has(port!)) failures.push(`Issue ${issue.number}'s reviewer has no distinct Storybook port`);
    else ports.add(port!);
    for (const session of [...implementer, ...reviewer]) {
      const mustPark = issue.slice > 0 || session.role === "reviewer";
      if (mustPark && !session.parked) failures.push(`Issue ${issue.number}'s ${session.role} is not parked`);
      if (session.parked && !session.brief.trimStart().startsWith(waitLine)) failures.push(`Issue ${issue.number}'s parked ${session.role} brief does not open with the wait line`);
    }
  }
  if (plan.sessions.some((item) => !planned.some((issue) => issue.number === item.issue))) failures.push("A session is planned for an issue outside the slices");
  for (const expected of scenario.openQuestions) {
    const found = plan.openQuestions.find((item) => item.blocks === expected.blocks);
    if (!found) { failures.push(`No open question recorded for issue ${expected.blocks}`); continue; }
    if (found.label !== "ready-for-human" || found.parent !== epicNumber) failures.push(`Open question for issue ${expected.blocks} is not a ready-for-human sub-issue of the epic`);
    if (found.filed !== expected.filed) failures.push(`Open question for issue ${expected.blocks} has filed=${found.filed}; expected ${expected.filed}`);
  }
  if (plan.openQuestions.length > scenario.openQuestions.length) failures.push(`Plan records ${plan.openQuestions.length} open questions; expected ${scenario.openQuestions.length}`);
  return failures;
}

export async function checkOrchestratorEvaluation(root: string) {
  const manifest: Manifest = JSON.parse(await readFile(join(root, "manifest.json"), "utf8"));
  if (manifest.version !== 1 || !Array.isArray(manifest.cases)) throw new Error("Unsupported evaluation manifest");
  const results = [];
  for (const scenario of manifest.cases) {
    if (!/^[a-z0-9-]+$/.test(scenario.id)) throw new Error("Invalid evaluation case ID");
    const run = join(root, "runs", scenario.id);
    const failures: string[] = [];
    const extra = (await readdir(run)).filter((name) => !["backlog.json", "prompt.md", "plan.json"].includes(name));
    if (extra.length) failures.push(`Wrote files other than plan.json: ${extra.join(", ")}`);
    const text = await readFile(join(run, "plan.json"), "utf8").catch(() => undefined);
    let plan: Plan | undefined;
    try { plan = text === undefined ? undefined : JSON.parse(text); } catch { failures.push("plan.json is not valid JSON"); }
    if (text === undefined) failures.push("No plan recorded");
    else if (plan) {
      if (![plan.slices, plan.skipped, plan.sessions, plan.openQuestions].every(Array.isArray)) failures.push("plan.json does not match the requested shape");
      else failures.push(...checkPlan(scenario, plan, manifest.epic));
    }
    results.push({ case: scenario.id, automatedPass: failures.length === 0, failures, rubric: scenario.rubric });
  }
  return { skill: "orchestrator", mode: "auto", cases: results, requiresSemanticReview: true };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [command, argument] = process.argv.slice(2).filter((value) => value !== "--");
  try {
    if (command === "prepare") console.log(await prepareOrchestratorEvaluation(argument ?? join(repository, "harness-skills/orchestrator")));
    else if (command === "check" && argument) {
      const result = await checkOrchestratorEvaluation(resolve(argument));
      console.log(JSON.stringify(result, null, 2));
      if (result.cases.some((item) => !item.automatedPass)) process.exitCode = 1;
    }
    else throw new Error("Usage: pnpm evaluate:orchestrator prepare [skill-directory] | check <evaluation-root>");
  } catch (error) { console.error(error instanceof Error ? error.message : "Evaluation failed"); process.exitCode = 1; }
}
