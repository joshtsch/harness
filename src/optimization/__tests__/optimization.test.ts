import { describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { adaptPromptSession, collectSessionEvidence, createSessionOptimizationHook, submitOptimization, type OptimizationSubmission, type PromptSessionInput } from "../index.js";
import type { SessionFinalization } from "../../session/session-finalization.js";

const observation = {
  id: "observation-1", traceId: "trace-1", scope: "session" as const, kind: "observation" as const,
  statement: "Review mode reduced unneeded edits", hypothesis: "Explicit mode reduces scope drift", evidence: ["trace-1:event-2"],
  feedback: [{ source: "deterministic" as const, summary: "diff check passed" }], proposedChange: "Suggest review mode for diff-only tasks",
  expectedBenefit: "fewer unrelated edits", risk: "false recommendation", confidence: 0.8, rollbackPath: "remove recommendation rule", status: "open" as const,
};

const candidate = {
  id: "candidate-1", scope: "harness" as const, summary: "Use review mode for diff-only work", evidenceIds: ["observation-1"],
  rollbackPath: "revert rule", verification: ["run tests"], changesPolicy: false, changesPermissions: false, changesSafety: false,
  expectedBenefit: 0.8, confidence: 0.8, cost: 0.1, risk: 0.1, evidenceStrength: 0.9,
};

const submission = (overrides: Partial<OptimizationSubmission> = {}): OptimizationSubmission => ({
  observations: [observation], candidates: [candidate], evaluation: {
    events: [{ sessionId: "session-1", projectKey: "harness", mode: "review", skill: "review", event: "complete", durationMs: 10, result: "success" }],
    artifactChecks: [{ id: "report", provenance: "trace-1", exists: true, valid: true }],
    rawSignals: { safety: 1, quality: 1, efficiency: 1, outcome: 1, adaptability: 1 },
  }, ...overrides,
});

describe("optimization facade", () => {
  it("returns ranked evidence and a pending-review handoff through one interface", () => {
    const result = submitOptimization(submission());

    expect(result.handoff).toMatchObject({ metadata: { candidateId: "candidate-1", status: "candidate" } });
    expect(result.evaluation.status).toBe("pass");
    expect(result.rankedCandidates.map(({ id }) => id)).toEqual(["candidate-1"]);
  });

  it("blocks handoff when hard evaluation gates fail", () => {
    const base = submission();
    const result = submitOptimization({ ...base, evaluation: { ...base.evaluation, rawSignals: { safety: 1, quality: 1, efficiency: 1, outcome: 0, adaptability: 1 } } });

    expect(result.evaluation.status).toBe("fail");
    expect(result.handoff).toBeNull();
  });

  it("rejects candidates that escape submitted provenance", () => {
    expect(() => submitOptimization(submission({ candidates: [{ ...candidate, evidenceIds: ["unknown"] }] }))).toThrow("unknown observation evidence");
  });
});

const promptSession = (harnessRoot: string, overrides: Partial<PromptSessionInput> = {}): PromptSessionInput => ({
  harnessRoot, sessionId: "session-1", traceId: "trace-1", projectKey: "harness", prompt: "Review the completed session",
  resolvedContext: { id: "context-1", provenance: "trace-1:context", summary: "review mode and repository policy" },
  events: [{ sessionId: "session-1", projectKey: "harness", mode: "review", skill: "review", event: "complete", durationMs: 10, result: "success" }],
  artifacts: [{ id: "report", provenance: "trace-1:artifact:report", exists: true, valid: true }],
  observedState: [{ id: "working-tree", provenance: "trace-1:state:working-tree", matches: true }],
  feedback: [{ id: "feedback-1", source: "deterministic", summary: "diff check passed", proposedChange: "Suggest review mode for diff-only tasks", expectedBenefit: "fewer unrelated edits", risk: "false recommendation", confidence: 0.8, rollbackPath: "remove recommendation rule", verification: ["run tests"], scope: "harness", expectedBenefitScore: 0.8, cost: 0.1, riskScore: 0.1, evidenceStrength: 0.9 }],
  ...overrides,
});

describe("prompt/session optimization adapter", () => {
  it("is deterministic, persists redacted evidence, and returns a traced candidate handoff", async () => {
    const root = await mkdtemp(join(tmpdir(), "optimization-adapter-"));
    try {
      const input = promptSession(root);
      const first = await adaptPromptSession(input);
      const second = await adaptPromptSession(input);

      expect(second).toEqual(first);
      expect(first.observations[0]).toMatchObject({ traceId: "trace-1", status: "open" });
      expect(first.handoff).toMatchObject({ metadata: { status: "candidate", traceId: "trace-1", sessionId: "session-1", feedbackId: "feedback-1", proposedChange: "Suggest review mode for diff-only tasks", provenance: { prompt: "trace-1:prompt", context: { id: "context-1", provenance: "trace-1:context" }, artifacts: [{ id: "report", provenance: "trace-1:artifact:report" }] } } });
      const persisted = await readFile(join(root, "docs/.scratch/setup/session-1/observations.jsonl"), "utf8");
      expect(persisted).not.toContain("Review the completed session");
      expect(persisted.trim().split("\n")).toHaveLength(1);
      expect(first.observations[0].evidence).toContain("trace-1:artifact:report");

      const concurrentRoot = await mkdtemp(join(tmpdir(), "optimization-adapter-"));
      try {
        await Promise.all([adaptPromptSession(promptSession(concurrentRoot)), adaptPromptSession(promptSession(concurrentRoot))]);
        const concurrentPersisted = await readFile(join(concurrentRoot, "docs/.scratch/setup/session-1/observations.jsonl"), "utf8");
        expect(concurrentPersisted.trim().split("\n")).toHaveLength(1);
      } finally {
        await rm(concurrentRoot, { recursive: true, force: true });
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("blocks handoff for failed gates and rejects escaped provenance or sensitive input", async () => {
    const root = await mkdtemp(join(tmpdir(), "optimization-adapter-"));
    const failureRoots = await Promise.all([1, 2, 3].map(() => mkdtemp(join(tmpdir(), "optimization-adapter-"))));
    try {
      const failed = await adaptPromptSession(promptSession(failureRoots[0], { observedState: [{ id: "working-tree", provenance: "trace-1:state:working-tree", matches: false }] }));
      expect(failed.evaluation.status).toBe("fail");
      expect(failed.handoff).toBeNull();
      const failedSafety = await adaptPromptSession(promptSession(failureRoots[1], { events: [{ ...promptSession(failureRoots[1]).events[0], result: "failure", failureCategory: "validation" }] }));
      expect(failedSafety.handoff).toBeNull();
      const failedArtifact = await adaptPromptSession(promptSession(failureRoots[2], { artifacts: [{ id: "report", provenance: "trace-1:artifact:report", exists: false, valid: false }] }));
      expect(failedArtifact.handoff).toBeNull();
      await expect(adaptPromptSession(promptSession(root, { artifacts: [{ id: "report", provenance: "other-trace:artifact:report", exists: true, valid: true }] }))).rejects.toThrow("escapes submitted trace");
      await expect(adaptPromptSession(promptSession(root, { prompt: ["Contact person", "example.com"].join("@") }))).rejects.toThrow("sensitive content");
      await expect(adaptPromptSession(promptSession(root, { feedback: [{ ...promptSession(root).feedback[0], expectedBenefitScore: Number.NaN }] }))).rejects.toThrow("expectedBenefitScore");
      await expect(adaptPromptSession(promptSession(root, { feedback: [{ ...promptSession(root).feedback[0], source: "unknown" as never }] }))).rejects.toThrow("feedback.source");
      await expect(adaptPromptSession(promptSession(root, { artifacts: [{ id: "report", provenance: "trace-1:artifact:report", exists: "false" as never, valid: true }] }))).rejects.toThrow("artifact validity flags");
      await expect(adaptPromptSession(promptSession(root, { artifacts: [{ id: "report", provenance: null as never, exists: true, valid: true }] }))).rejects.toThrow("artifact provenance");
      await expect(adaptPromptSession(promptSession(root, { feedback: [{ ...promptSession(root).feedback[0], verification: "run tests" as never }] }))).rejects.toThrow("feedback.verification");
      await expect(adaptPromptSession(promptSession(root, { feedback: [promptSession(root).feedback[0], promptSession(root).feedback[0]] }))).rejects.toThrow("duplicate feedback id");
      await expect(adaptPromptSession(promptSession(root, { observedState: [{ id: "report", provenance: "trace-1:state:report", matches: true }] }))).rejects.toThrow("duplicate session evidence id");
    } finally {
      await rm(root, { recursive: true, force: true });
      await Promise.all(failureRoots.map((path) => rm(path, { recursive: true, force: true })));
    }
  });
});

describe("session finalization optimization hook", () => {
  const finalization: SessionFinalization = {
    sessionId: "session-1", traceId: "trace-1", projectKey: "harness", status: "success",
    prompt: { id: "issue-1", provenance: "trace-1:prompt" },
    resolvedContext: { id: "context-1", provenance: "trace-1:context", summary: "session setup" },
    events: [{ sessionId: "session-1", projectKey: "harness", mode: "session-setup", skill: "setup:session", event: "finalized", durationMs: 0, result: "success" }],
    artifacts: [], feedback: [], observedState: [],
  };

  it("accepts sessions without explicit feedback and honors the kill switch", async () => {
    const root = await mkdtemp(join(tmpdir(), "optimization-hook-"));
    const diagnostics: unknown[] = [];
    try {
      await expect(createSessionOptimizationHook({ harnessRoot: root, enabled: false, onDiagnostic: (diagnostic) => { diagnostics.push(diagnostic); } })(finalization)).resolves.toBeUndefined();
      expect(diagnostics).toEqual([]);
      await expect(createSessionOptimizationHook({ harnessRoot: root })(finalization)).resolves.toBeUndefined();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("surfaces rule suggestions through the finalization hook", async () => {
    const root = await mkdtemp(join(tmpdir(), "optimization-rule-hook-"));
    const suggestions: string[] = [];
    try {
      const hook = createSessionOptimizationHook({ harnessRoot: root, onRuleSuggestion: (suggestion) => { suggestions.push(suggestion.id); } });
      await hook({ ...finalization, prompt: { id: "Update .env.example whenever variables are added", provenance: "trace-1:prompt" } });
      expect(suggestions).toHaveLength(1);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("collects traceable references without raw prompt content and blocks partial handoffs", async () => {
    const root = await mkdtemp(join(tmpdir(), "optimization-collector-"));
    try {
      const collected = collectSessionEvidence({ harnessRoot: root }, finalization);
      expect(collected.prompt).toBe("issue-1");
      expect(JSON.stringify(collected)).not.toContain("raw prompt");
      expect(collected.feedback).toEqual([]);

      const partial = await adaptPromptSession(collectSessionEvidence({ harnessRoot: root }, { ...finalization, status: "interrupted" }));
      expect(partial.evaluation.status).toBe("fail");
      expect(partial.handoff).toBeNull();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("rejects malformed finalization before collecting evidence", () => {
    expect(() => collectSessionEvidence({ harnessRoot: "/tmp/harness" }, { ...finalization, events: [{ ...finalization.events[0], sessionId: "other-session" }] })).toThrow("escapes session");
    expect(() => collectSessionEvidence({ harnessRoot: "/tmp/harness" }, { ...finalization, resolvedContext: { ...finalization.resolvedContext, provenance: "other-trace:context" } })).toThrow("escapes submitted trace");
    expect(() => collectSessionEvidence({ harnessRoot: "/tmp/harness" }, { ...finalization, feedback: [{ id: "feedback-1", source: "deterministic", summary: "summary", proposedChange: "change", expectedBenefit: "benefit", risk: "risk", confidence: 0.5, rollbackPath: "rollback", verification: [] }] })).toThrow("feedback.verification");
  });

  it("isolates collector failures as diagnostics", async () => {
    const diagnostics: unknown[] = [];
    await expect(createSessionOptimizationHook({ harnessRoot: "", onDiagnostic: (diagnostic) => { diagnostics.push(diagnostic); } })(finalization)).resolves.toBeUndefined();
    expect(diagnostics).toEqual([{ sessionId: "session-1", traceId: "trace-1", error: "Error: prompt session harnessRoot must be non-empty" }]);
  });
});
