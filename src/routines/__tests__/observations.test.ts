import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { addRuntimeEvent, appendObservation, createObservation, loadObservations } from "../index.js";

const input = {
  id: "observation-1", traceId: "trace-1", scope: "session" as const, kind: "observation" as const,
  statement: "Review mode reduced unneeded edits", hypothesis: "Explicit mode reduces scope drift", evidence: ["trace-1:event-2"],
  feedback: [{ source: "deterministic" as const, summary: "diff check passed" }], proposedChange: "Suggest review mode for diff-only tasks",
  expectedBenefit: "fewer unrelated edits", risk: "false recommendation", confidence: 0.8, rollbackPath: "remove recommendation rule", status: "open" as const,
};

describe("scoped observations", () => {
  it("captures provenance, bounded events, and feedback", () => {
    const observation = addRuntimeEvent(createObservation(input), { event: "review", durationMs: 12, result: "success" });
    expect(observation).toMatchObject({ traceId: "trace-1", feedback: input.feedback, events: [{ event: "review" }] });
  });

  it("rejects sensitive or unscoped project observations", () => {
    expect(() => createObservation({ ...input, scope: "project", projectKey: "" })).toThrow("projectKey");
    expect(() => createObservation({ ...input, statement: "token: abcdefghijklmnop" })).toThrow("sensitive");
  });

  it("persists observations only in session scratch state", async () => {
    const root = await mkdtemp(join(tmpdir(), "harness-observations-"));
    try {
      await mkdir(join(root, "docs", ".scratch", "setup", "session-1"), { recursive: true });
      await appendObservation(root, "session-1", createObservation(input));
      await expect(loadObservations(root, "session-1")).resolves.toHaveLength(1);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
