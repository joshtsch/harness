import { describe, expect, it } from "vitest";
import { approveEvalCase, evaluateSession, generateEvalCase, recordOperationalEvent, validateArtifact } from "../index.js";

const event = { sessionId: "session-1", projectKey: "harness", mode: "review", skill: "code-review", event: "complete", durationMs: 10, result: "success" as const };
const signals = { safety: 1, quality: 0.9, efficiency: 0.8, outcome: 1, adaptability: 0.7 } as const;

describe("session evaluation", () => {
  it("records redacted operational events and proposes reviewed evals", () => {
    expect(recordOperationalEvent(event)).toEqual(event);
    const proposed = generateEvalCase("repeated review finding", ["obs-1", "obs-2"]);
    expect(proposed.status).toBe("proposed");
    expect(approveEvalCase(proposed).status).toBe("approved");
  });

  it("validates actual artifacts and applies hard safety and outcome gates", () => {
    expect(validateArtifact({ id: "report", provenance: "test", exists: true, valid: true }).valid).toBe(true);
    expect(evaluateSession({ events: [event], artifactChecks: [{ id: "report", provenance: "test", exists: true, valid: true }], rawSignals: signals, baseline: { outcome: 0.8 } })).toMatchObject({ status: "pass", gates: { safety: "pass", outcome: "pass" }, baseline: { outcome: 0.8 } });
    expect(evaluateSession({ events: [event], artifactChecks: [], rawSignals: { ...signals, safety: 0 } }).status).toBe("fail");
  });

  it("rejects unreviewed eval shortcuts and unsafe event data", () => {
    expect(() => generateEvalCase("single", ["obs-1"])).toThrow("repeated");
    expect(() => recordOperationalEvent({ ...event, event: "apiKey: abcdefghijklmnop" })).toThrow("sensitive");
  });
});
