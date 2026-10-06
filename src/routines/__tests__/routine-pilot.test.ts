import { describe, expect, it } from "vitest";
import { runReadOnlyPilot } from "../index.js";

describe("read-only routine pilot", () => {
  it("produces a dry-run report and go recommendation without external writes", async () => {
    const result = await runReadOnlyPilot({
      contract: { id: "report", version: "1", inputs: ["input"], outputs: ["report"], tools: [], failureBehavior: "report failure" }, input: {},
      execute: async (_input, mode) => ({ output: { mode }, outputValid: true, sideEffects: [], artifacts: [{ id: "report", valid: true, provenance: "pilot" }], observedState: [], durationMs: 1 }),
      runId: "run-1", provenance: "pilot", schedule: { state: "draft", approved: false, authorized: false }, artifactId: "report",
    });
    expect(result).toMatchObject({ goNoGo: "go", run: { mode: "dry_run" }, report: { artifactId: "report" }, schedule: { state: "draft" } });
  });

  it("does not recommend a cancelled pilot", async () => {
    const result = await runReadOnlyPilot({
      contract: { id: "report", version: "1", inputs: [], outputs: [], tools: [], failureBehavior: "report failure" }, input: {},
      execute: async () => ({ output: "report", outputValid: true, sideEffects: [], artifacts: [], observedState: [], durationMs: 1 }), runId: "run-1", provenance: "pilot", schedule: { state: "cancelled", approved: false, authorized: false }, artifactId: "report",
    });
    expect(result.goNoGo).toBe("no-go");
  });
});
