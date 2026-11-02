import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { checkMemoryTrialsEvaluation, prepareMemoryTrialsEvaluation } from "../scripts/evaluate-memory-trials.js";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

async function fixture() {
  const root = await prepareMemoryTrialsEvaluation();
  roots.push(root);
  const manifest = JSON.parse(await readFile(join(root, "manifest.json"), "utf8"));
  return { root, manifest };
}

async function plannedOutputs(root: string, manifest: Awaited<ReturnType<typeof fixture>>["manifest"]) {
  for (const { scenario } of manifest.cases) {
    const run = join(root, "runs", scenario.id);
    const backend = JSON.parse(await readFile(join(run, "fixture/backend.json"), "utf8"));
    const contract = JSON.parse(await readFile(join(run, "fixture/case.json"), "utf8"));
    const observations = scenario.requireUnsupported ? [{ case: contract.id, phase: scenario.requireUnsupported, attempt: 1,
      outcome: "unsupported", semanticReviewed: false, evidence: ["fixture/backend.json"], measurements: {} }] : [];
    await writeFile(join(run, "response.md"), "Synthetic checker fixture only; not an agent evaluation.\n");
    await writeFile(join(run, "run.json"), JSON.stringify({ version: 2, suiteDigest: manifest.suiteDigest,
      variant: "candidate", revision: "synthetic", backend: { architecture: backend.architecture, adapter: backend.adapter, revision: backend.revision },
      environment: { model: "synthetic", settings: "fixed", tools: "read-only", context: "fresh" },
      expected: contract.phases.map((phase: string) => ({ case: contract.id, phase, attempt: 1 })), observations }));
  }
}

describe("memory-trials portability evaluation", () => {
  it("uses identical behavioral inputs across native representations and withholds grading material", async () => {
    const { root, manifest } = await fixture();
    const inputs = await Promise.all(manifest.cases.map(({ scenario }: { scenario: { id: string } }) => readFile(join(root, "runs", scenario.id, "fixture/case.json"), "utf8")));
    expect(new Set(inputs).size).toBe(1);
    const prompt = await readFile(join(root, "runs/record-backend/prompt.md"), "utf8");
    expect(prompt).not.toContain(manifest.cases[1].scenario.rubric[0]);
    await expect(readFile(join(root, "runs/record-backend/fixture/wiki/index.md"))).rejects.toThrow();
    const result = await checkMemoryTrialsEvaluation(root);
    expect(result.cases.every((item) => !item.automatedPass)).toBe(true);
    expect(result.requiresSemanticReview).toBe(true);
  });

  it("checks planning artifacts separately from meaning and catches writes, fake execution and identity drift", async () => {
    const { root, manifest } = await fixture();
    await plannedOutputs(root, manifest);
    expect((await checkMemoryTrialsEvaluation(root)).cases.every((item) => item.automatedPass)).toBe(true);
    await writeFile(join(root, "runs/record-backend/fixture/records.json"), "[]");
    const reportFile = join(root, "runs/repository-backend/run.json");
    const report = JSON.parse(await readFile(reportFile, "utf8"));
    report.observations = [{ ...report.expected[0], outcome: "pass", semanticReviewed: true, evidence: ["invented.md"], measurements: { elapsedMs: 5 } }];
    report.backend.architecture = "invented-backend";
    await writeFile(reportFile, JSON.stringify(report));
    const results = await checkMemoryTrialsEvaluation(root);
    expect(results.cases[0]?.failures).toContain("Planning-only case claimed execution or telemetry");
    expect(results.cases[0]?.failures).toContain("Incorrect backend or behavioral contract identity");
    expect(results.cases[1]?.failures).toContain("Protected fixture changed");
  });

  it("requires absent retrieval to remain an unsupported roundtrip capability", async () => {
    const { root, manifest } = await fixture();
    await plannedOutputs(root, manifest);
    const reportFile = join(root, "runs/missing-retrieval/run.json");
    const report = JSON.parse(await readFile(reportFile, "utf8"));
    report.observations = [];
    await writeFile(reportFile, JSON.stringify(report));
    expect((await checkMemoryTrialsEvaluation(root)).cases[2]?.failures).toContain("Missing unsupported capability outcome");
  });
});
