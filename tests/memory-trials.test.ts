import { describe, expect, it } from "vitest";
import { compareTrialRuns, parseTrialRun, summarizeTrialRun } from "../scripts/memory-trials.js";

function fixture() {
  return {
    version: 1, suiteDigest: "a".repeat(64), variant: "baseline", revision: "baseline-revision",
    environment: { model: "synthetic", settings: "fixed", tools: "offline", context: "fresh" },
    expected: [1, 2, 3].map((attempt) => ({ case: "recall-setting", phase: "recall", attempt })),
    observations: [
      { case: "recall-setting", phase: "recall", attempt: 1, outcome: "pass", semanticReviewed: true,
        evidence: ["response-1.md"], measurements: { elapsedMs: 10, toolCalls: 2 } },
      { case: "recall-setting", phase: "recall", attempt: 2, outcome: "fail", semanticReviewed: true,
        evidence: ["response-2.md"], measurements: { elapsedMs: 30, toolCalls: null } },
    ],
  };
}

describe("memory trial measurements", () => {
  it("keeps failures and missing trials in the denominator and unavailable telemetry out of percentiles", () => {
    const report = summarizeTrialRun(parseTrialRun(fixture())).phases[0]!;
    expect(report).toMatchObject({ expected: 3, observed: 2, missing: 1, outcomes: { pass: 1, fail: 1 }, passRateOfPlanned: 1 / 3 });
    expect(report.measurements.elapsedMs).toEqual({ samples: 2, median: 20, p95: 30, unavailable: 1 });
    expect(report.measurements.toolCalls).toEqual({ samples: 1, median: 2, p95: 2, unavailable: 2 });
    expect(report.measurements.inputTokens).toEqual({ samples: 0, median: null, p95: null, unavailable: 3 });
  });

  it("reports every ingestion stage separately, including blocked approval and unsupported reruns", () => {
    const input = fixture();
    input.expected = ["ingest-proposal", "ingest-apply", "ingest-rerun", "roundtrip-recall"].map((phase) => ({ case: "ingest-setting", phase, attempt: 1 }));
    input.observations = input.expected.map((slot, index) => ({ ...slot,
      outcome: ["pass", "blocked", "unsupported", "blocked"][index]!, semanticReviewed: index === 0,
      evidence: ["synthetic-evidence.md"], measurements: { elapsedMs: 0, toolCalls: null } }));
    const report = summarizeTrialRun(parseTrialRun(input));
    expect(report.phases.map((item) => item.phase)).toEqual(input.expected.map((item) => item.phase));
    expect(report.phases[1]?.outcomes.blocked).toBe(1);
    expect(report.phases[2]?.outcomes.unsupported).toBe(1);
  });

  it("rejects duplicate, unplanned, unreviewed passing, and invalid telemetry observations", () => {
    const duplicate = fixture();
    duplicate.observations.push(duplicate.observations[0]!);
    expect(() => parseTrialRun(duplicate)).toThrow("duplicate observation");
    const unplanned = fixture();
    unplanned.observations[0]!.attempt = 9;
    expect(() => parseTrialRun(unplanned)).toThrow("Unexpected");
    const unreviewed = fixture();
    unreviewed.observations[0]!.semanticReviewed = false;
    expect(() => parseTrialRun(unreviewed)).toThrow("semantic review");
    for (const measurements of [{ toolCalls: -1 }, { toolCalls: 1.5 }, { elapsedMs: Infinity }, { invented: 1 }, { elapsedMs: 5, firstEvidenceMs: 10 }]) {
      const input = fixture();
      Object.assign(input.observations[0]!, { measurements });
      expect(() => parseTrialRun(input)).toThrow();
    }
    const missingEvidence = fixture();
    missingEvidence.observations[0]!.evidence = [];
    expect(() => parseTrialRun(missingEvidence)).toThrow("evidence");
  });

  it("pairs equal planned slots, preserves missing outcomes, and rejects incomparable runs", () => {
    const before = parseTrialRun(fixture());
    const after = parseTrialRun({ ...fixture(), variant: "candidate", revision: "candidate-revision" });
    after.observations[0]!.measurements.elapsedMs = 6;
    after.observations.pop();
    expect(compareTrialRuns(before, after).paired).toMatchObject([
      { baseline: "pass", candidate: "pass", deltas: { elapsedMs: -4, inputTokens: null } },
      { baseline: "fail", candidate: "missing", deltas: { elapsedMs: null } },
      { baseline: "missing", candidate: "missing" },
    ]);
    for (const changed of [
      { ...after, suiteDigest: "b".repeat(64) },
      { ...after, environment: { ...after.environment, context: "repeated" as const } },
      { ...after, expected: after.expected.slice(1) },
    ]) expect(() => compareTrialRuns(before, changed)).toThrow("identical");
  });
});
