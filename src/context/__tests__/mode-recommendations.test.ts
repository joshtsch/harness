import { describe, expect, it } from "vitest";
import { recommendMode, recordModeRejection, recordModeSelection } from "../index.js";

describe("mode recommendations", () => {
  it("uses explicit command and lifecycle evidence with high confidence", () => {
    const result = recommendMode({ command: "/review", lifecycle: "review", issueLabels: ["ready-for-agent"] });
    expect(result.recommendation).toMatchObject({ mode: "review", confidence: "high" });
    expect(result.requiresConfirmation).toBe(true);
    expect(result.alternatives).toEqual([{ mode: "implementation", confidence: "medium", evidence: ["issue label: ready-for-agent"] }]);
  });

  it("returns medium-confidence alternatives from issue evidence", () => {
    const result = recommendMode({ issueLabels: ["needs-triage", "ready-for-human"] });
    expect(result.recommendation).toMatchObject({ mode: "triage", confidence: "high" });
    expect(result.observations[0].type).toBe("recommendation");
  });

  it("records confirmation or rejection without activating a mode", () => {
    const result = recommendMode({ command: "research" });
    expect(recordModeSelection(result, "research").observations.at(-1)).toMatchObject({ type: "selection", mode: "research" });
    expect(recordModeRejection(result).observations.at(-1)).toMatchObject({ type: "rejection", mode: "research" });
  });
});
