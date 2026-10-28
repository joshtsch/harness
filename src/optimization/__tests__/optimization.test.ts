import { describe, expect, it } from "vitest";
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
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
  const paths = (root: string) => ({
    observations: join(root, "docs/.scratch/setup/session-1/observations.jsonl"),
    suggestions: join(root, "docs/.scratch/setup/session-1/rule-suggestions.jsonl"),
  });
  const snapshot = async (root: string) => {
    const entries = await readdir(root, { recursive: true });
    return Promise.all(entries.sort().map(async (entry) => [entry, (await stat(join(root, entry))).isFile() ? await readFile(join(root, entry), "utf8") : null]));
  };
  const apply = async (input: PromptSessionInput) => {
    const preview = await adaptPromptSession(input);
    return adaptPromptSession(input, { confirmed: true, approvedProposalId: preview.proposal.approvalId });
  };

  it("defaults to a deterministic zero-write preview with a traced candidate handoff", async () => {
    const root = await mkdtemp(join(tmpdir(), "optimization-adapter-"));
    try {
      const input = promptSession(root, { prompt: "Always update .env.example whenever variables are added" });
      const before = await snapshot(root);
      const first = await adaptPromptSession(input);
      expect(await adaptPromptSession(input)).toEqual(first);
      expect(await snapshot(root)).toEqual(before);
      expect(first.mode).toBe("dry-run");
      expect(first.proposal.changes).toHaveLength(2);
      expect(first.proposal.changes.every(({ before }) => before === null)).toBe(true);
      expect(first.proposal.evidence).toContain("trace-1:artifact:report");
      expect(first.observations[0]).toMatchObject({ traceId: "trace-1", status: "open" });
      expect(first.handoff).toMatchObject({ metadata: { status: "candidate", traceId: "trace-1", sessionId: "session-1", feedbackId: "feedback-1", proposedChange: "Suggest review mode for diff-only tasks", provenance: { prompt: "trace-1:prompt", context: { id: "context-1", provenance: "trace-1:context" }, artifacts: [{ id: "report", provenance: "trace-1:artifact:report" }] } } });
      expect(first.proposal.changes.find(({ destination }) => destination === paths(root).observations)?.after).not.toContain(input.prompt);
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it("writes exactly the approved batch and preserves populated state during later previews", async () => {
    const root = await mkdtemp(join(tmpdir(), "optimization-adapter-"));
    try {
      const input = promptSession(root, { prompt: "Always update .env.example whenever variables are added" });
      const preview = await adaptPromptSession(input);
      const applied = await adaptPromptSession(input, { confirmed: true, approvedProposalId: preview.proposal.approvalId });
      expect(applied.mode).toBe("applied");
      for (const change of preview.proposal.changes) expect(await readFile(change.destination, "utf8")).toBe(change.after);
      const before = await snapshot(root);
      const repeated = await adaptPromptSession(input);
      expect(repeated.ruleSuggestions).toEqual([]);
      expect(repeated.proposal.changes.every(({ before, after }) => before === after)).toBe(true);
      expect(await snapshot(root)).toEqual(before);
      const next = await adaptPromptSession(promptSession(root, { traceId: "trace-2", resolvedContext: { id: "context-2", provenance: "trace-2:context", summary: "context" }, artifacts: [], observedState: [] }));
      expect(next.proposal.changes.find(({ destination }) => destination === paths(root).observations)?.before).toBe(await readFile(paths(root).observations, "utf8"));
      expect(await snapshot(root)).toEqual(before);
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it("rejects missing confirmation, stale approval, destination drift and changed requested content without writing", async () => {
    const root = await mkdtemp(join(tmpdir(), "optimization-adapter-"));
    const other = await mkdtemp(join(tmpdir(), "optimization-adapter-"));
    try {
      const input = promptSession(root);
      const preview = await adaptPromptSession(input);
      const approved = { confirmed: true, approvedProposalId: preview.proposal.approvalId };
      await expect(adaptPromptSession(input, { approvedProposalId: preview.proposal.approvalId })).rejects.toThrow("explicit user confirmation");
      await expect(adaptPromptSession(input, { confirmed: true })).rejects.toThrow("stale");
      await expect(adaptPromptSession({ ...input, harnessRoot: other }, approved)).rejects.toThrow("stale");
      await expect(adaptPromptSession({ ...input, feedback: [{ ...input.feedback[0], summary: "Changed summary" }] }, approved)).rejects.toThrow("stale");
      expect(await snapshot(root)).toEqual([]);
      expect(await snapshot(other)).toEqual([]);
      await mkdir(join(root, "docs/.scratch/setup/session-1"), { recursive: true });
      await writeFile(paths(root).observations, "\n");
      const before = await snapshot(root);
      await expect(adaptPromptSession(input, approved)).rejects.toThrow("stale");
      expect(await snapshot(root)).toEqual(before);
    } finally { await Promise.all([root, other].map((path) => rm(path, { recursive: true, force: true }))); }
  });

  it("serializes concurrent applies and rejects approval made stale by the first writer", async () => {
    const root = await mkdtemp(join(tmpdir(), "optimization-adapter-"));
    try {
      const input = promptSession(root);
      const preview = await adaptPromptSession(input);
      const approval = { confirmed: true, approvedProposalId: preview.proposal.approvalId };
      const results = await Promise.allSettled([adaptPromptSession(input, approval), adaptPromptSession(input, approval)]);
      expect(results.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
      const rejected = results.find((result) => result.status === "rejected");
      expect(rejected?.status === "rejected" && String(rejected.reason)).toContain("stale");
      expect((await readFile(paths(root).observations, "utf8")).trim().split("\n")).toHaveLength(1);
      expect(await readdir(join(root, "docs/.scratch/setup/session-1"))).toEqual(["observations.jsonl"]);
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it("validates persisted observations and suggestions even when previewing", async () => {
    const root = await mkdtemp(join(tmpdir(), "optimization-adapter-"));
    try {
      const input = promptSession(root, { prompt: "Always update .env.example whenever variables are added" });
      await apply(input);
      const original = await readFile(paths(root).observations, "utf8");
      await writeFile(paths(root).observations, original + original);
      await expect(adaptPromptSession(input)).rejects.toThrow("duplicate persisted observation id");
      await writeFile(paths(root).observations, original);
      await expect(adaptPromptSession({ ...input, feedback: [{ ...input.feedback[0], summary: "conflicting summary" }] })).rejects.toThrow("observation persistence conflict");
      const suggestions = await readFile(paths(root).suggestions, "utf8");
      await writeFile(paths(root).suggestions, suggestions + suggestions);
      await expect(adaptPromptSession(input)).rejects.toThrow("duplicate persisted rule suggestion id");
      await writeFile(paths(root).suggestions, suggestions);
      await expect(adaptPromptSession({ ...input, ruleSignals: [{ source: "user", statement: input.prompt, rationale: "Changed rationale" }], prompt: "Review this completed session" })).rejects.toThrow("rule suggestion persistence conflict");
      await writeFile(paths(root).suggestions, '{"id":"invalid"}\n');
      await expect(adaptPromptSession(input)).rejects.toThrow();
    } finally { await rm(root, { recursive: true, force: true }); }
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
      await expect(createSessionOptimizationHook({ harnessRoot: root, onDiagnostic: (diagnostic) => { diagnostics.push(diagnostic); } })({ ...finalization, resolvedContext: { ...finalization.resolvedContext, provenance: "bad-trace" } })).resolves.toBeUndefined();
      expect(diagnostics).toEqual([]);
      expect(await readdir(root)).toEqual([]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("displays a dry-run proposal through the finalization hook without writing", async () => {
    const root = await mkdtemp(join(tmpdir(), "optimization-rule-hook-"));
    const suggestions: string[] = [];
    try {
      const hook = createSessionOptimizationHook({ harnessRoot: root, onProposal: (proposal) => { suggestions.push(proposal.approvalId); } });
      await hook({ ...finalization, prompt: { id: "Update .env.example whenever variables are added", provenance: "trace-1:prompt" } });
      expect(suggestions).toHaveLength(1);
      expect(await readdir(root)).toEqual([]);
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
    await expect(createSessionOptimizationHook({ harnessRoot: "", onProposal: () => undefined, onDiagnostic: (diagnostic) => { diagnostics.push(diagnostic); } })(finalization)).resolves.toBeUndefined();
    expect(diagnostics).toEqual([{ sessionId: "session-1", traceId: "trace-1", error: "Error: prompt session harnessRoot must be non-empty" }]);
  });
});
