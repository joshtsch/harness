import { access, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { checkRoutingEvaluation, prepareRoutingEvaluation, reportRows } from "../scripts/evaluate-routing-skill.js";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

async function fixture(skill: string) {
  const root = await prepareRoutingEvaluation(resolve("harness-skills", skill));
  roots.push(root);
  return root;
}

const table = (header: string, rows: number) => [
  header,
  `|${" --- |".repeat(header.split("|").length - 2)}`,
  ...Array.from({ length: rows }, (_, index) => `|${` item ${index} |`.repeat(header.split("|").length - 2)}`),
].join("\n");
const enforcementHeader = "| Rule | Harm point | Floor | Backstops and the gap each covers | Block message | Gaps for `knowledge-routing` |";
const knowledgeHeader = "| Item | Owner and scope | Context layer | Authoritative source | Activation path | Required links; enforcement handoff |";

describe("routing skill behavioral evaluation", () => {
  it("counts report rows only under the header with every report column", () => {
    const columns = [/harm point/i, /floor/i];
    expect(reportRows(`Intro\n\n| Harm point | B |\n| --- | --- |\n| x | y |\n\n${table(enforcementHeader, 2)}\n\nGaps follow.`, columns)).toBe(2);
    expect(reportRows("No table here.", columns)).toBeUndefined();
  });

  it("applies case overrides on top of the shared workspace", async () => {
    const root = await fixture("enforcement-routing");
    expect(await readFile(join(root, "runs/retire-guidance/workspace/AGENTS.md"), "utf8")).toContain("## Branch rule");
    expect(await readFile(join(root, "runs/secret-commit/workspace/AGENTS.md"), "utf8")).not.toContain("## Branch rule");
    expect(await readFile(join(root, "runs/secret-commit/workspace/scripts/hooks/commit-guard.mjs"), "utf8")).toContain("process.exit(2)");
  });

  it("gives knowledge-routing cases a harness snapshot with the synthetic project inventory", async () => {
    const root = await fixture("knowledge-routing");
    const workspace = join(root, "runs/existing-vocabulary/workspace");
    expect(await readFile(join(workspace, "CONTEXT.md"), "utf8")).toContain("**Change request**");
    await access(join(workspace, "docs/agents/repository-intake.md"));
    expect(await readFile(join(workspace, "projects.yml"), "utf8")).toContain("copper:");
    await access(join(root, "harness-skills/enforcement-routing/SKILL.md"));
  });

  for (const [skill, header, split] of [
    ["enforcement-routing", enforcementHeader, "composite-rule"],
    ["knowledge-routing", knowledgeHeader, "composite-session-learnings"],
  ] as const) {
    it(`passes complete ${skill} responses and flags edits, missing reports, and unsplit items`, async () => {
      const root = await fixture(skill);
      const manifest = JSON.parse(await readFile(join(root, "manifest.json"), "utf8"));
      const [first, second, third] = manifest.cases.map(({ scenario }: { scenario: { id: string } }) => scenario.id).filter((id: string) => id !== split);
      for (const { scenario } of manifest.cases) await writeFile(join(root, "runs", scenario.id, "response.md"), table(header, scenario.minRows));
      expect((await checkRoutingEvaluation(root)).cases.every((item) => item.automatedPass)).toBe(true);

      await writeFile(join(root, "runs", split, "response.md"), table(header, 1));
      await writeFile(join(root, "runs", first, "workspace/AGENTS.md"), "Edited\n");
      await writeFile(join(root, "runs", second, "workspace/new-file.md"), "\n");
      await rm(join(root, "runs", third, "response.md"));
      const results = await checkRoutingEvaluation(root);
      const failures = (id: string) => results.cases.find((item) => item.case === id)?.failures;
      expect(failures(split)?.[0]).toMatch(/^Report has 1 rows; expected at least [23]$/);
      expect(failures(first)).toContain("Changed workspace path: AGENTS.md");
      expect(failures(second)).toContain("Created workspace paths");
      expect(failures(third)).toEqual(["No evaluator response recorded"]);
      expect(results.requiresSemanticReview).toBe(true);
    });
  }
});
