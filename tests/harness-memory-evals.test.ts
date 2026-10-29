import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { checkMemoryEvaluation, prepareMemoryEvaluation } from "../scripts/evaluate-harness-memory.js";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

async function fixture() {
  const root = await prepareMemoryEvaluation(resolve("harness-skills/harness-memory"));
  roots.push(root);
  return root;
}

describe("harness-memory behavioral evaluation", () => {
  it("catches flat ingestion and accepts a linked topic while preserving legacy content", async () => {
    const root = await fixture();
    const run = join(root, "runs/legacy-ingest");
    const vault = join(run, "vault");
    const flat = join(vault, "wiki/scoped-inputs.md");
    const page = "---\ntype: Concept\nstatus: draft\ngenerated: {by: 'process:fixture', at: '2026-10-28T12:00:00Z'}\nsources:\n  - id: stages\n    resource: ../raw/stages.md\n---\n# Scoped inputs\n\nExplicit inputs separate references from run evidence.[^stages]\n\n[^stages]: Fixture source.\n";
    await writeFile(flat, page);
    await writeFile(join(run, "response.md"), "Captured fixture research.\n");
    const initial = await checkMemoryEvaluation(root);
    expect(initial.cases.find((item) => item.case === "legacy-ingest")?.failures).toContain("new wiki concept needs a topic directory: wiki/scoped-inputs.md");
    await mkdir(join(vault, "wiki/citation-research"));
    const target = join(vault, "wiki/citation-research/scoped-inputs.md");
    await rename(flat, target);
    await writeFile(target, page.replace("../raw/", "../../raw/"));
    await writeFile(join(vault, "wiki/citation-research/index.md"), "# Citation research\n\n[Scoped inputs](scoped-inputs.md)\n");
    const index = join(vault, "wiki/index.md");
    await writeFile(index, `${await readFile(index, "utf8")}\n[Citation research](citation-research/index.md)\n`);
    await writeFile(join(vault, "wiki/log.md"), "# Log\n\n## 2026-10-28\n\nCaptured scoped inputs.\n");
    const final = await checkMemoryEvaluation(root);
    expect(final.cases.find((item) => item.case === "legacy-ingest")?.failures).toEqual([]);
    expect(await readFile(join(vault, "wiki/legacy.md"), "utf8")).toContain("Preserve this flat page unchanged.");
  });

  it("isolates runs and detects read-only writes and protected-source changes", async () => {
    const root = await fixture();
    const query = join(root, "runs/legacy-retrieval/vault");
    const ingest = join(root, "runs/ingest-output-promotion/vault");
    await writeFile(join(query, "unexpected.md"), "Unrequested query artifact\n");
    await writeFile(join(ingest, "raw/copper.md"), "Source overwritten\n");
    const result = await checkMemoryEvaluation(root);
    expect(result.cases.find((item) => item.case === "legacy-retrieval")?.failures).toContain("Read-only operation created paths");
    expect(result.cases.find((item) => item.case === "ingest-output-promotion")?.failures).toContain("Changed protected path: raw/copper.md");
    expect(result.cases.find((item) => item.case === "dry-run")?.failures).toEqual(["No evaluator response recorded"]);
    expect(await readFile(join(root, "runs/dry-run/vault/wiki/index.md"), "utf8")).toContain("Handwritten catalog");
    expect(result.requiresSemanticReview).toBe(true);
  });

  it("detects sensitive copying and invalid generated concept metadata", async () => {
    const root = await fixture();
    const vault = join(root, "runs/preference-and-sensitive-input/vault");
    await mkdir(join(vault, "wiki/topic"), { recursive: true });
    await writeFile(join(vault, "wiki/topic/leak.md"), "---\ntype: Concept\nstatus: draft\ngenerated: {by: invented prose actor, at: yesterday}\n---\nCONFIDENTIAL_FIXTURE_PAYLOAD\n[Missing](missing.md)\n");
    const result = await checkMemoryEvaluation(root);
    const failures = result.cases.find((item) => item.case === "preference-and-sensitive-input")?.failures;
    expect(failures).toContain("Sensitive input leaked into generated file: wiki/topic/leak.md");
    expect(failures).toContain("wiki/topic/leak.md: Invalid actor/time metadata");
    expect(failures).toContain("Unresolved local link in wiki/topic/leak.md: missing.md");
  });
});
