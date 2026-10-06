import { describe, expect, it } from "vitest";
import { discoverRoutineCandidates, type TaskTrace } from "../index.js";

const trace = (id: string): TaskTrace => ({ id, projectKey: "harness", fingerprint: "report", tools: ["git"], inputSummary: "redacted input", outputSummary: "redacted output", durationMs: 10, approvalPoints: [], failures: [], sideEffects: [] });

describe("routine discovery", () => {
  it("creates reviewable candidates only from confirmed repeated traces", () => {
    const candidates = discoverRoutineCandidates({ traces: [trace("trace-1"), trace("trace-2")], confirmedFingerprints: ["report"] });
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({ status: "candidate", evidenceIds: ["trace-1", "trace-2"], risks: ["candidate is not enabled"] });
  });

  it("does not discover from unconfirmed or single traces and rejects sensitive traces", () => {
    expect(discoverRoutineCandidates({ traces: [trace("trace-1"), trace("trace-2")], confirmedFingerprints: [] })).toEqual([]);
    expect(() => discoverRoutineCandidates({ traces: [{ ...trace("trace-1"), inputSummary: "api_key: abcdefghijklmnop" }, trace("trace-2")], confirmedFingerprints: ["report"] })).toThrow("sensitive");
  });
});
