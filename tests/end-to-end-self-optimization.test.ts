import { describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { adaptPromptSession, type PromptSessionInput } from "../src/optimization/index.js";
import { createSessionFinalizer, type SessionFinalization } from "../src/session/session-finalization.js";

const createFinalization = (overrides: Partial<SessionFinalization> = {}): SessionFinalization => ({
  sessionId: "session-e2e",
  traceId: "trace-e2e",
  projectKey: "harness",
  status: "success",
  prompt: { id: "raw-session-prompt", provenance: "trace-e2e:prompt" },
  resolvedContext: { id: "context-e2e", provenance: "trace-e2e:context", summary: "review mode" },
  events: [{ sessionId: "session-e2e", projectKey: "harness", mode: "review", skill: "code-review", event: "complete", durationMs: 10, result: "success" }],
  artifacts: [{ id: "report", provenance: "trace-e2e:artifact:report", exists: true, valid: true }],
  feedback: [{ id: "feedback-e2e", source: "deterministic", summary: "review mode reduced scope drift", proposedChange: "Recommend review mode for diff-only work", expectedBenefit: "fewer unrelated edits", risk: "false recommendation", confidence: 0.9, rollbackPath: "remove recommendation", verification: ["run tests"] }],
  observedState: [{ id: "working-tree", provenance: "trace-e2e:state:working-tree", matches: true }],
  ...overrides,
});

const inputFromFinalization = (harnessRoot: string, finalization: SessionFinalization): PromptSessionInput => ({
  harnessRoot,
  sessionId: finalization.sessionId,
  traceId: finalization.traceId,
  projectKey: finalization.projectKey,
  prompt: finalization.prompt.id,
  resolvedContext: finalization.resolvedContext,
  events: finalization.events,
  artifacts: finalization.artifacts,
  observedState: finalization.observedState,
  feedback: finalization.feedback.map((feedback) => ({
    ...feedback,
    scope: "harness" as const,
    expectedBenefitScore: feedback.confidence,
    cost: 0.1,
    riskScore: 0.1,
    evidenceStrength: feedback.confidence,
  })),
});

describe("end-to-end self-optimization workflow", () => {
  it("finalizes, persists one observation, and returns a review-only handoff deterministically", async () => {
    const root = await mkdtemp(join(tmpdir(), "self-optimization-e2e-"));
    try {
      const finalization = createSessionFinalizer()(createFinalization());
      const first = await adaptPromptSession(inputFromFinalization(root, finalization));
      const second = await adaptPromptSession(inputFromFinalization(root, finalization));

      expect(second).toEqual(first);
      expect(first.observations).toHaveLength(1);
      expect(first.handoff).toMatchObject({ metadata: { status: "candidate", sessionId: "session-e2e", traceId: "trace-e2e" } });
      expect(first.handoff?.metadata).not.toHaveProperty("promoted");
      const persisted = await readFile(join(root, "docs/.scratch/setup/session-e2e/observations.jsonl"), "utf8");
      expect(persisted).not.toContain("raw-session-prompt");
      expect(persisted.trim().split("\n")).toHaveLength(1);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it.each([
    ["failed event", { events: [{ ...createFinalization().events[0], result: "failure" as const, failureCategory: "validation" }] }],
    ["missing artifact", { artifacts: [{ id: "report", provenance: "trace-e2e:artifact:report", exists: false, valid: false }] }],
    ["mismatched observed state", { observedState: [{ id: "working-tree", provenance: "trace-e2e:state:working-tree", matches: false }] }],
  ])("records %s without producing a handoff", async (_name, overrides) => {
    const root = await mkdtemp(join(tmpdir(), "self-optimization-e2e-failure-"));
    try {
      const finalization = createSessionFinalizer()(createFinalization(overrides));
      const result = await adaptPromptSession(inputFromFinalization(root, finalization));
      expect(result.evaluation.status).toBe("fail");
      expect(result.handoff).toBeNull();
      expect(result.observations).toHaveLength(1);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
