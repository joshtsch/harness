import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { checkInterviewEvaluation, prepareInterviewEvaluation } from "../scripts/evaluate-interview.js";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

async function fixture() {
  const domainModeling = await mkdtemp(join(tmpdir(), "domain-modeling-"));
  await writeFile(join(domainModeling, "SKILL.md"), "---\nname: domain-modeling\n---\n");
  const root = await prepareInterviewEvaluation(resolve("harness-skills/interview"), domainModeling);
  roots.push(root, domainModeling);
  return root;
}

const question = "❓ **Limits per tier** (3 open after this)\n\nWhich limits?\n\n➡️ 600/min. Yes?\n";
const tree = (extra = "") => `# Rate limiting\n\n- [x] **Limit key**: per Tenant API key.\n- [~] **Limits per tier**\n- [ ] **Counter storage**\n  - [ ] **Failure mode**\n- [ ] **Over-limit response**\n\n## Changed\n${extra}`;

async function pass(root: string) {
  const manifest = JSON.parse(await readFile(join(root, "manifest.json"), "utf8"));
  for (const { scenario } of manifest.cases) {
    const run = join(root, "runs", scenario.id);
    await writeFile(join(run, "response.md"), scenario.tree ? question : "ESLint or Biome? I recommend Biome.\n");
    if (scenario.tree) {
      await mkdir(join(run, "workspace/docs/.scratch"), { recursive: true });
      await writeFile(join(run, "workspace/docs/.scratch/rate-limiting-decision-tree.md"), tree(scenario.changed ? "\n- Limit key: was per key, now per IP, because health checks\n" : ""));
    }
  }
}

describe("interview behavioral evaluation", () => {
  it("passes one-question responses with a tracked tree", async () => {
    const root = await fixture();
    await pass(root);
    const results = await checkInterviewEvaluation(root);
    expect(results.cases.filter((item) => !item.automatedPass)).toEqual([]);
    expect(results.requiresSemanticReview).toBe(true);
  });

  it("flags batched questions, missing trees, stray edits, lost decisions, and unlogged changes", async () => {
    const root = await fixture();
    await pass(root);
    const run = (id: string) => join(root, "runs", id);
    await writeFile(join(run("multi-decision"), "response.md"), question + question);
    await rm(join(run("fact-lookup"), "workspace/docs/.scratch"), { recursive: true });
    await writeFile(join(run("fact-lookup"), "workspace/AGENTS.md"), "Edited\n");
    await writeFile(join(run("resume-tree"), "workspace/docs/.scratch/rate-limiting-decision-tree.md"), tree().replace("- [x] **Limit key**", "- [ ] **Limit key**"));
    await writeFile(join(run("overturned-decision"), "workspace/docs/.scratch/rate-limiting-decision-tree.md"), tree());
    await mkdir(join(run("single-decision"), "workspace/docs/.scratch"), { recursive: true });
    await writeFile(join(run("single-decision"), "workspace/docs/.scratch/lint-decision-tree.md"), tree());
    const failures = Object.fromEntries((await checkInterviewEvaluation(root)).cases.map((item) => [item.case, item.failures]));
    expect(failures["multi-decision"]).toContain("Response asks 2 formatted questions");
    expect(failures["fact-lookup"]).toEqual(expect.arrayContaining(["Changed path outside scratch and domain docs: AGENTS.md", "Expected one decision-tree file; found 0"]));
    expect(failures["resume-tree"]).toContain("Tree lost settled decision: - [x] **Limit key**");
    expect(failures["overturned-decision"]).toContain("Tree logs no change under ## Changed");
    expect(failures["single-decision"]).toContain("Created a tree file for a single decision");
  });
});
