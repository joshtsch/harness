import { describe, expect, it, vi } from "vitest";
import { createSessionFinalizer, runSessionFinalizationHook, type SessionFinalization } from "../session-finalization.js";

const finalization: SessionFinalization = {
  sessionId: "session-1", traceId: "trace-1", projectKey: "harness", status: "success",
  prompt: { id: "prompt-1", provenance: "trace-1:prompt" },
  resolvedContext: { id: "context-1", provenance: "trace-1:context", summary: "review mode" },
  events: [{ sessionId: "session-1", projectKey: "harness", mode: "review", skill: "code-review", event: "complete", durationMs: 10, result: "success" }],
  artifacts: [{ id: "report", provenance: "trace-1:artifact", exists: true, valid: true }],
  feedback: [], observedState: [{ id: "tree", provenance: "trace-1:state", matches: true }],
};

describe("session finalization contract", () => {
  it("emits one validated result for successful and partial sessions", () => {
    const finalize = createSessionFinalizer();
    const first = finalize(finalization);
    expect(finalize({ ...finalization, status: "failed" })).toBe(first);
    expect(createSessionFinalizer()({ ...finalization, status: "cancelled" }).status).toBe("cancelled");
  });

  it("rejects escaped provenance and mismatched session events", () => {
    const finalize = createSessionFinalizer();
    expect(() => finalize({ ...finalization, prompt: { id: "prompt", provenance: "other-trace:prompt" } })).toThrow("escapes submitted trace");
    expect(() => finalize({ ...finalization, events: [{ ...finalization.events[0], sessionId: "other-session" }] })).toThrow("escapes session");
  });

  it("keeps hook failures outside the primary session result", async () => {
    const hook = vi.fn(async () => { throw new Error("review unavailable"); });
    await expect(runSessionFinalizationHook(hook, finalization)).resolves.toEqual({ ok: false, error: "Error: review unavailable" });
    expect(hook).toHaveBeenCalledWith(finalization);
  });
});
