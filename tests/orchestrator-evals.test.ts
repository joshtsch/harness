import { readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { checkOrchestratorEvaluation, prepareOrchestratorEvaluation } from "../scripts/evaluate-orchestrator.js";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

const wait = "Wait first: do nothing until a go message arrives; reply in one line that you're waiting, then end your turn.\n...";
type Case = { id: string; slices: number[][]; stackedOn: Record<string, number>; skipped: number[]; openQuestions: { blocks: number; filed: boolean }[] };

function goodPlan(scenario: Case) {
  let order = 0;
  let port = 6100;
  const branch = (number: number) => `${number}-work`;
  return {
    slices: scenario.slices.map((issues) => ({ issues: issues.map((number) => ({ number, branch: branch(number), base: scenario.stackedOn[String(number)] ? branch(scenario.stackedOn[String(number)]) : "main" })) })),
    skipped: scenario.skipped.map((number) => ({ number, reason: "not ready" })),
    sessions: scenario.slices.flatMap((issues, slice) => issues.flatMap((issue) => [
      { role: "implementer", issue, order: ++order, parked: slice > 0, brief: slice > 0 ? wait : "You are the implementation session." },
      { role: "reviewer", issue, order: ++order, parked: true, storybookPort: ++port, brief: wait },
    ])),
    openQuestions: scenario.openQuestions.map(({ blocks, filed }) => ({ blocks, filed, label: "ready-for-human", parent: 900, title: "Decide the empty-state copy" })),
  };
}

async function prepared() {
  const root = await prepareOrchestratorEvaluation(resolve("harness-skills/orchestrator"));
  roots.push(root);
  const manifest = JSON.parse(await readFile(join(root, "manifest.json"), "utf8"));
  const plans = Object.fromEntries(manifest.cases.map((scenario: Case) => [scenario.id, goodPlan(scenario)]));
  const write = async (id: string, plan: unknown) => writeFile(join(root, "runs", id, "plan.json"), JSON.stringify(plan));
  for (const [id, plan] of Object.entries(plans)) await write(id, plan);
  return { root, plans, write };
}

describe("orchestrator auto-mode plan evaluation", () => {
  it("passes a plan that slices, stacks, parks and files open questions as the fixture expects", async () => {
    const { root } = await prepared();
    const results = await checkOrchestratorEvaluation(root);
    expect(results.cases.filter((item) => !item.automatedPass)).toEqual([]);
    expect(results.requiresSemanticReview).toBe(true);
  });

  it("flags coupled issues in one slice, wrong bases, unparked sessions, review order, and guessed questions", async () => {
    const { root, plans, write } = await prepared();
    const stacked = structuredClone(plans["stacked-slices"]);
    stacked.slices = [{ issues: [...stacked.slices[0].issues, { ...stacked.slices[1].issues[0], base: "main" }] }];
    stacked.sessions = stacked.sessions.map((session: { role: string; order: number; parked: boolean; brief: string }) => session.role === "reviewer" ? { ...session, order: 0, parked: false, brief: "Review it." } : session);
    await write("stacked-slices", stacked);
    await write("open-question-authorized", { ...plans["open-question-authorized"], openQuestions: [] });
    await write("open-question-unauthorized", { ...plans["open-question-unauthorized"], openQuestions: [{ blocks: 12, filed: true, label: "ready-for-human", parent: 900, title: "x" }] });
    const failures = Object.fromEntries((await checkOrchestratorEvaluation(root)).cases.map((item) => [item.case, item.failures]));
    expect(failures["stacked-slices"]).toEqual(expect.arrayContaining([
      "Slice 1 has [1,2,3]; expected [1,2]",
      "Issue 3 has base main; expected 1-work",
      "Issue 1's reviewer starts before its implementer",
      "Issue 1's reviewer is not parked",
    ]));
    expect(failures["open-question-authorized"]).toContain("No open question recorded for issue 12");
    expect(failures["open-question-unauthorized"]).toContain("Open question for issue 12 has filed=true; expected false");
  });

  it("flags a missing plan and stray files", async () => {
    const { root } = await prepared();
    await rm(join(root, "runs/stacked-slices/plan.json"));
    await writeFile(join(root, "runs/open-question-authorized/notes.md"), "stray\n");
    const failures = Object.fromEntries((await checkOrchestratorEvaluation(root)).cases.map((item) => [item.case, item.failures]));
    expect(failures["stacked-slices"]).toContain("No plan recorded");
    expect(failures["open-question-authorized"]).toContain("Wrote files other than plan.json: notes.md");
  });
});
