import { describe, expect, it } from "vitest";
import { evaluateRoutine, runRoutine, type RoutineContract } from "../index.js";

type Input = { bookingId: string };
type Output = { eventId: string };

const contract: RoutineContract<Input, Output> = {
  id: "booking-report",
  version: "1",
  inputs: ["bookingId"],
  outputs: ["eventId"],
  tools: ["calendar"],
  outputValidator: (output) => output.eventId.startsWith("event-"),
  failureBehavior: "return a failure report without retrying side effects",
};

describe("routine execution", () => {
  it("runs a dry run and reports planned side effects without applying them", async () => {
    const result = await runRoutine(contract, { bookingId: "booking-1" }, async (_input, mode) => ({
      output: { eventId: "event-1" },
      outputValid: true,
      sideEffects: [{ kind: "external", target: "calendar-1", action: "create event", applied: false }],
      artifacts: [{ id: "draft-event", valid: true, provenance: "calendar-draft" }],
      observedState: [{ id: "booking-1", matches: true, provenance: "booking-read" }],
      durationMs: mode === "dry_run" ? 12 : 20,
    }));

    expect(result.mode).toBe("dry_run");
    expect(result.sideEffects).toEqual([
      { kind: "external", target: "calendar-1", action: "create event", applied: false },
    ]);
  });

  it("rejects a dry run that reports an applied side effect", async () => {
    await expect(runRoutine(contract, { bookingId: "booking-1" }, async () => ({
      output: { eventId: "event-1" },
      outputValid: true,
      sideEffects: [{ kind: "external", target: "calendar-1", action: "create event", applied: true }],
      artifacts: [],
      observedState: [],
      durationMs: 1,
    }))).rejects.toThrow("dry run applied a side effect");
  });

  it("rejects an output that fails the contract validator", async () => {
    await expect(runRoutine(contract, { bookingId: "booking-1" }, async () => ({
      output: { eventId: "not-an-event" },
      outputValid: true,
      sideEffects: [],
      artifacts: [],
      observedState: [],
      durationMs: 1,
    }))).rejects.toThrow("routine output failed validation");
  });
});

describe("routine evaluation", () => {
  it("keeps raw signals, validates artifacts and state, and applies hard gates", () => {
    const evaluation = evaluateRoutine(contract, {
      runId: "run-2",
      provenance: "session-2",
      baselineRunId: "baseline-1",
      run: {
        mode: "dry_run",
        output: { eventId: "event-1" },
        outputValid: true,
        sideEffects: [{ kind: "external", target: "calendar-1", action: "create event", applied: false }],
        artifacts: [{ id: "draft-event", valid: true, provenance: "calendar-draft" }],
        observedState: [{ id: "booking-1", matches: true, provenance: "booking-read" }],
        durationMs: 12,
      },
      signals: { safety: true, quality: 0.8, efficiency: 0.6, outcome: false, adaptability: 0.7 },
    });

    expect(evaluation).toMatchObject({
      contractId: "booking-report",
      contractVersion: "1",
      runId: "run-2",
      provenance: "session-2",
      baselineRunId: "baseline-1",
      signals: { safety: true, quality: 0.8, efficiency: 0.6, outcome: false, adaptability: 0.7 },
      outputValidation: { valid: true },
      artifactValidation: { valid: true, invalidIds: [] },
      observedStateValidation: { valid: true, invalidIds: [] },
      gates: { safety: "pass", outcome: "fail" },
      status: "fail",
      reviewStatus: "pending",
      regressionReady: false,
    });
  });

  it("fails the safety gate when a run applied a side effect", () => {
    const evaluation = evaluateRoutine(contract, {
      runId: "run-3",
      provenance: "session-3",
      run: {
        mode: "execute",
        output: { eventId: "event-1" },
        outputValid: true,
        sideEffects: [{ kind: "external", target: "calendar-1", action: "create event", applied: true }],
        artifacts: [{ id: "event", valid: true, provenance: "calendar" }],
        observedState: [{ id: "calendar-1", matches: true, provenance: "calendar-read" }],
        durationMs: 12,
      },
      signals: { safety: true, quality: 1, efficiency: 1, outcome: true, adaptability: 1 },
    });

    expect(evaluation.gates.safety).toBe("fail");
    expect(evaluation.status).toBe("fail");
  });
});
