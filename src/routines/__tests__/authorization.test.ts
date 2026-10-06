import { describe, expect, it } from "vitest";
import { authorizeRoutine, canExecute, revokeAuthorization } from "../index.js";

describe("routine authorization", () => {
  it("requires explicit approval and supports draft-only execution", () => {
    const auth = authorizeRoutine({ routineId: "report", tier: "draft", sideEffectClass: "none", scope: "project:harness" });
    expect(canExecute(auth)).toBe(true);
  });

  it("blocks revoked, expired, and unauthorized side effects", () => {
    const auth = authorizeRoutine({ routineId: "calendar", tier: "draft", sideEffectClass: "external", scope: "project:harness" });
    expect(canExecute(auth)).toBe(true);
    const revoked = revokeAuthorization(auth, "human", "pilot ended");
    expect(canExecute(revoked.authorization)).toBe(false);
    expect(revoked.audit).toMatchObject({ decision: "revoked", authority: "human" });
    expect(canExecute(authorizeRoutine({ routineId: "old", tier: "draft", sideEffectClass: "none", scope: "project:harness", expiresAt: "2020-01-01T00:00:00.000Z" }))).toBe(false);
  });
});
