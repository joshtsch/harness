import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
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
  it("keeps destination-choice cases independent of the protected local fixture", async () => {
    const root = await fixture();
    for (const id of ["choose-vault-home", "notion-setup-gap"]) {
      const prompt = await readFile(join(root, "runs", id, "prompt.md"), "utf8");
      expect(prompt).toContain("No vault home or provider has been selected.");
      expect(prompt).not.toContain("Selected vault:");
      expect(prompt).toContain("it is not the destination");
    }
    const notion = await readFile(join(root, "runs/explicit-notion/prompt.md"), "utf8");
    expect(notion).toContain("Selected provider: Notion.");
    expect(notion).not.toContain("Selected vault:");
    const repository = await readFile(join(root, "runs/initialize-preserve/prompt.md"), "utf8");
    expect(repository).toContain("Selected vault:");
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
  it("requires default dry runs for ingest, initialization and remember requests without demanding generated files", async () => {
    const root = await fixture();
    const manifest = JSON.parse(await readFile(join(root, "manifest.json"), "utf8"));
    for (const { scenario } of manifest.cases) {
      expect(scenario.readOnly).toBe(true);
      await writeFile(join(root, "runs", scenario.id, "response.md"), "Unsaved dry run shown; awaiting separate approval.\n");
    }
    const results = await checkMemoryEvaluation(root);
    expect(results.cases.every((item) => item.automatedPass)).toBe(true);
    const init = join(root, "runs/initialize-preserve/vault");
    await mkdir(join(init, "wiki"));
    await writeFile(join(init, "wiki/log.md"), "Dry run logged\n");
    const changed = await checkMemoryEvaluation(root);
    expect(changed.cases.find((item) => item.case === "initialize-preserve")?.failures).toContain("Read-only operation created paths");
  });

});
