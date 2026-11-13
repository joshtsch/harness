import { access, cp, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { snapshot } from "./evaluate-harness-memory.js";

interface Scenario { id: string; task: string; files?: Record<string, string>; tree: boolean; minOpen?: number; keep?: string[]; changed?: boolean; rubric: string[] }
interface Fixture { base?: Record<string, string>; cases: Scenario[] }
type Snapshot = Awaited<ReturnType<typeof snapshot>>;
interface Manifest { version: 1; cases: { scenario: Scenario; before: Snapshot }[]; skillWords: number; skillBytes: number }

const repository = resolve(import.meta.dirname, "..");
// The interview may only write its tree file and the domain docs domain-modeling owns.
const writable = /^(docs\/(\.scratch|adr)\/|GLOSSARY\.md$|GLOSSARY-MAP\.md$)/;
const treeFile = /^docs\/\.scratch\/[^/]+-decision-tree\.md$/;

export async function prepareInterviewEvaluation(skillDirectory: string, domainModelingDirectory: string): Promise<string> {
  const skill = resolve(skillDirectory);
  await access(join(domainModelingDirectory, "SKILL.md")).catch(() => { throw new Error("domain-modeling skill not found; run pnpm init:harness or pass its directory"); });
  const root = await mkdtemp(join(tmpdir(), "interview-evals-"));
  await cp(skill, join(root, "skills/interview"), { recursive: true });
  await cp(domainModelingDirectory, join(root, "skills/domain-modeling"), { recursive: true });
  const fixture: Fixture = JSON.parse(await readFile(join(repository, "tests/fixtures/interview-evals.json"), "utf8"));
  const cases: Manifest["cases"] = [];
  for (const scenario of fixture.cases) {
    const run = join(root, "runs", scenario.id);
    const workspace = join(run, "workspace");
    for (const [file, contents] of Object.entries({ ...fixture.base, ...scenario.files })) {
      const target = resolve(workspace, file);
      if (!target.startsWith(`${workspace}${sep}`)) throw new Error("Fixture path escapes its workspace");
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, contents);
    }
    const prompt = `Use $interview at ${join(root, "skills/interview/SKILL.md")}; its domain-modeling skill is at ${join(root, "skills/domain-modeling/SKILL.md")}.\n\nRepository root (a feature worktree, not a default clone; treat it as the harness root): ${workspace}\n\n${scenario.task}\n\nThis is a disposable synthetic fixture. Write files only where the skills direct, inside the repository root. Record the exact message you would send the user next in ${join(run, "response.md")}, then stop: do not answer your own questions or call user-input tools. No interactive question tool is available here, so use the skill's text format. Do not inspect the evaluation manifest or other cases. No external actions.\n`;
    await writeFile(join(run, "prompt.md"), prompt);
    cases.push({ scenario, before: await snapshot(workspace) });
  }
  const contents = await readFile(join(skill, "SKILL.md"), "utf8");
  const manifest: Manifest = { version: 1, cases, skillWords: contents.trim().split(/\s+/).length, skillBytes: Buffer.byteLength(contents) };
  await writeFile(join(root, "manifest.json"), JSON.stringify(manifest, null, 2));
  return root;
}

const count = (text: string, pattern: RegExp) => text.match(pattern)?.length ?? 0;

export async function checkInterviewEvaluation(root: string) {
  const manifest: Manifest = JSON.parse(await readFile(join(root, "manifest.json"), "utf8"));
  if (manifest.version !== 1 || !Array.isArray(manifest.cases)) throw new Error("Unsupported evaluation manifest");
  const results = [];
  for (const { scenario, before } of manifest.cases) {
    if (!/^[a-z0-9-]+$/.test(scenario.id)) throw new Error("Invalid evaluation case ID");
    const run = join(root, "runs", scenario.id);
    const workspace = join(run, "workspace");
    const after = await snapshot(workspace);
    const failures: string[] = [];
    for (const name of new Set([...Object.keys(before), ...Object.keys(after)])) {
      if (JSON.stringify(after[name]) !== JSON.stringify(before[name]) && !writable.test(name) && after[name]?.kind !== "directory") failures.push(`Changed path outside scratch and domain docs: ${name}`);
    }
    const trees = Object.keys(after).filter((name) => treeFile.test(name));
    const response = await readFile(join(run, "response.md"), "utf8").catch(() => undefined);
    if (response === undefined) failures.push("No evaluator response recorded");
    else {
      const questions = count(response, /❓/g);
      if (scenario.tree ? questions !== 1 : questions > 1) failures.push(`Response asks ${questions} formatted questions`);
      if (scenario.tree && !response.includes("➡️")) failures.push("Response has no recommended answer");
      if (!scenario.tree && !response.includes("?")) failures.push("Response asks no question");
    }
    if (!scenario.tree && trees.length > Object.keys(before).filter((name) => treeFile.test(name)).length) failures.push("Created a tree file for a single decision");
    if (scenario.tree) {
      if (trees.length !== 1) failures.push(`Expected one decision-tree file; found ${trees.length}`);
      else {
        const tree = await readFile(join(workspace, trees[0]), "utf8");
        if (count(tree, /^\s*- \[~\]/gm) !== 1) failures.push("Tree must mark exactly one decision [~]");
        const open = count(tree, /^\s*- \[[ ~?]\]/gm);
        if (open < (scenario.minOpen ?? 0)) failures.push(`Tree has ${open} unsettled decisions; expected at least ${scenario.minOpen}`);
        for (const line of scenario.keep ?? []) if (!tree.includes(line)) failures.push(`Tree lost settled decision: ${line}`);
        if (scenario.changed && !/## Changed\s*\n+\s*- \S/.test(tree)) failures.push("Tree logs no change under ## Changed");
      }
    }
    results.push({ case: scenario.id, automatedPass: failures.length === 0, failures, rubric: scenario.rubric });
  }
  return { skill: "interview", skillWords: manifest.skillWords, skillBytes: manifest.skillBytes, cases: results, requiresSemanticReview: true };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [command, argument, domainModeling] = process.argv.slice(2).filter((value) => value !== "--");
  try {
    if (command === "prepare") console.log(await prepareInterviewEvaluation(argument ?? join(repository, "harness-skills/interview"), resolve(domainModeling ?? join(repository, ".agents/skills/domain-modeling"))));
    else if (command === "check" && argument) {
      const result = await checkInterviewEvaluation(resolve(argument));
      console.log(JSON.stringify(result, null, 2));
      if (result.cases.some((item) => !item.automatedPass)) process.exitCode = 1;
    }
    else throw new Error("Usage: pnpm evaluate:interview prepare [skill-directory] [domain-modeling-directory] | check <evaluation-root>");
  } catch (error) { console.error(error instanceof Error ? error.message : "Evaluation failed"); process.exitCode = 1; }
}
