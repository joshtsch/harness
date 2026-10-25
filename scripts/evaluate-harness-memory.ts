import { createHash } from "node:crypto";
import { access, cp, lstat, mkdir, mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";

interface Scenario {
  id: string;
  task: string;
  files: Record<string, string>;
  readOnly?: boolean;
  required?: string[];
  concepts?: boolean;
  forbiddenGeneratedText?: string;
  rubric: string[];
}
interface Entry { kind: "file" | "directory"; mode: number; modified: number; hash?: string }
type Snapshot = Record<string, Entry>;
interface CaseRun { scenario: Scenario; before: Snapshot }
interface Manifest { version: 1; cases: CaseRun[]; skillWords: number; skillBytes: number }

const repository = resolve(import.meta.dirname, "..");

async function snapshot(root: string, directory = root): Promise<Snapshot> {
  const entries: Snapshot = {};
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, item.name);
    if (item.isSymbolicLink()) throw new Error("Evaluation fixtures must not contain symlinks");
    const stat = await lstat(path);
    entries[relative(root, path)] = {
      kind: item.isDirectory() ? "directory" : "file", mode: stat.mode, modified: stat.mtimeMs,
      ...(item.isFile() ? { hash: createHash("sha256").update(await readFile(path)).digest("hex") } : {}),
    };
    if (item.isDirectory()) Object.assign(entries, await snapshot(root, path));
  }
  return entries;
}

export async function prepareMemoryEvaluation(skillDirectory: string): Promise<string> {
  const skill = resolve(skillDirectory);
  if (basename(skill) !== "harness-memory") throw new Error("Select a harness-memory skill directory");
  const sourceRoot = resolve(skill, "../..");
  const root = await mkdtemp(join(tmpdir(), "harness-memory-evals-"));
  await mkdir(join(root, "harness-skills"));
  await cp(skill, join(root, "harness-skills/harness-memory"), { recursive: true });
  await cp(join(sourceRoot, "harness-skills/knowledge-routing"), join(root, "harness-skills/knowledge-routing"), { recursive: true });
  await cp(join(sourceRoot, "docs/agents"), join(root, "docs/agents"), { recursive: true });
  await cp(join(sourceRoot, "CONTEXT.md"), join(root, "CONTEXT.md"));
  const scenarios: Scenario[] = JSON.parse(await readFile(join(repository, "tests/fixtures/harness-memory-evals.json"), "utf8"));
  const cases: CaseRun[] = [];
  for (const scenario of scenarios) {
    const run = join(root, "runs", scenario.id);
    const vault = join(run, "vault");
    const files = { "AGENTS.md": "# Handwritten fixture guide\n\nDisposable evaluation vault. Local fixture writes only when requested. Preserve this guide and accepted raw sources. No external services, real stores, repositories, commits, or package installation.\n", ...scenario.files };
    for (const [name, contents] of Object.entries(files)) {
      const target = resolve(vault, name);
      if (!target.startsWith(`${vault}${sep}`)) throw new Error("Fixture path escapes its vault");
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, contents);
    }
    const prompt = `Use $harness-memory at ${join(root, "harness-skills/harness-memory/SKILL.md")} for the following request.\n\n${scenario.task}\n\nSelected vault: ${vault}\nThis is a disposable fixture with established ownership, not a durable project requiring registration or provisioning. Read the fixture guide. Writes are limited to this vault; put your final response in ${join(run, "response.md")} as an evaluation transcript outside the vault. Record necessary confirmation questions in that response rather than calling user-input tools. Do not inspect the evaluation manifest or other cases. No external actions, live stores, or harness edits.\n`;
    await writeFile(join(run, "prompt.md"), prompt);
    cases.push({ scenario, before: await snapshot(vault) });
  }
  const contents = await readFile(join(skill, "SKILL.md"), "utf8");
  const manifest: Manifest = { version: 1, cases, skillWords: contents.trim().split(/\s+/).length, skillBytes: Buffer.byteLength(contents) };
  await writeFile(join(root, "manifest.json"), JSON.stringify(manifest, null, 2));
  return root;
}

export async function checkMemoryEvaluation(root: string) {
  const manifest: Manifest = JSON.parse(await readFile(join(root, "manifest.json"), "utf8"));
  if (manifest.version !== 1 || !Array.isArray(manifest.cases)) throw new Error("Unsupported evaluation manifest");
  const results = [];
  for (const { scenario, before } of manifest.cases) {
    if (!/^[a-z0-9-]+$/.test(scenario.id)) throw new Error("Invalid evaluation case ID");
    const vault = join(root, "runs", scenario.id, "vault");
    const after = await snapshot(vault);
    const failures: string[] = [];
    for (const [name, entry] of Object.entries(before)) {
      const protect = scenario.readOnly || (entry.kind === "file" && !name.startsWith(`incoming${sep}`));
      if (protect && JSON.stringify(after[name]) !== JSON.stringify(entry)) failures.push(`Changed protected path: ${name}`);
    }
    if (scenario.readOnly && Object.keys(after).some((name) => !before[name])) failures.push("Read-only operation created paths");
    for (const name of scenario.required ?? []) if (!after[name]) failures.push(`Missing required path: ${name}`);
    let concepts = 0;
    const localTarget = (name: string, target: string) => {
      const wikiPrefix = name.match(/^(.*(?:^|\/)wiki)\//)?.[1];
      const path = target.startsWith("/")
        ? resolve(vault, wikiPrefix ?? "", `.${target}`)
        : resolve(dirname(join(vault, name)), target);
      if (path !== vault && !path.startsWith(`${vault}${sep}`)) throw new Error("Reference escapes the selected fixture");
      return path;
    };
    for (const [name, entry] of Object.entries(after)) {
      if (/^(?:\.git|\.obsidian|node_modules)(?:\/|$)/.test(name)) failures.push(`Unexpected runtime/repository path: ${name}`);
      if (entry.kind !== "file") continue;
      const contents = await readFile(join(vault, name), "utf8");
      if (scenario.forbiddenGeneratedText && entry.hash !== before[name]?.hash && contents.includes(scenario.forbiddenGeneratedText)) failures.push(`Sensitive input leaked into generated file: ${name}`);
      if (name.endsWith(".md") && !name.startsWith(`templates${sep}`) && entry.hash !== before[name]?.hash) {
        for (const link of contents.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
          const target = link[1].split("#")[0];
          if (!target || /^[a-z][a-z0-9+.-]*:/i.test(target)) continue;
          try { await access(localTarget(name, decodeURIComponent(target))); }
          catch { failures.push(`Unresolved local link in ${name}: ${target}`); }
        }
      }
      if (!name.endsWith(".md") || !/(?:^|\/)wiki\//.test(name) || ["index.md", "log.md"].includes(basename(name))) continue;
      if (entry.hash === before[name]?.hash) continue;
      concepts++;
      try {
        const frontmatter = contents.match(/^---\n([\s\S]*?)\n---/);
        const metadata = frontmatter ? parse(frontmatter[1]) : undefined;
        if (typeof metadata?.type !== "string" || !["draft", "stable", "deprecated"].includes(metadata.status)) throw new Error("Missing concept type/status");
        const events = [metadata.generated, ...(Array.isArray(metadata.verified) ? metadata.verified : metadata.verified ? [metadata.verified] : [])];
        for (const event of events) {
          if (!/^(?:[^\s/]+\/[^\s/]+|(?:human|process):[^\s]+)$/.test(event?.by ?? "") || !/(?:Z|[+-]\d{2}:\d{2})$/.test(event?.at ?? "") || Number.isNaN(Date.parse(event.at))) throw new Error("Invalid actor/time metadata");
        }
        if (!Array.isArray(metadata.sources) || !metadata.sources.length) throw new Error("Missing source provenance");
        for (const source of metadata.sources) {
          if (typeof source.resource !== "string" || typeof source.id !== "string" || !contents.includes(`[^${source.id}]`)) throw new Error("Missing keyed source citation");
          if (!/^[a-z][a-z0-9+.-]*:/i.test(source.resource)) {
            await access(localTarget(name, source.resource));
          }
        }
      } catch (error) { failures.push(`${name}: ${error instanceof Error ? error.message : "Invalid concept"}`); }
    }
    if (scenario.concepts && !concepts) failures.push("No new topic concepts produced");
    try { await access(join(root, "runs", scenario.id, "response.md")); }
    catch { failures.push("No evaluator response recorded"); }
    results.push({ case: scenario.id, automatedPass: failures.length === 0, failures, rubric: scenario.rubric });
  }
  return { skillWords: manifest.skillWords, skillBytes: manifest.skillBytes, cases: results, requiresSemanticReview: true };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [command, argument] = process.argv.slice(2).filter((value) => value !== "--");
  try {
    if (command === "prepare") console.log(await prepareMemoryEvaluation(argument ?? join(repository, "harness-skills/harness-memory")));
    else if (command === "check" && argument) {
      const result = await checkMemoryEvaluation(resolve(argument));
      console.log(JSON.stringify(result, null, 2));
      if (result.cases.some((item) => !item.automatedPass)) process.exitCode = 1;
    }
    else throw new Error("Usage: pnpm evaluate:harness-memory prepare [skill-directory] | check <evaluation-root>");
  } catch (error) { console.error(error instanceof Error ? error.message : "Evaluation failed"); process.exitCode = 1; }
}
