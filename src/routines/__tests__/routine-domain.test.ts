import { describe, expect, it } from "vitest";
import { createDraftAutomation, createRoutineCandidate, type RoutineDefinition, validateRoutineDefinition } from "../index.js";

const routine: RoutineDefinition = { id: "report", owner: "harness", scope: "project", inputContract: ["session"], outputContract: ["report"], successMeasures: ["accurate"], requiredApproval: false, rollback: "remove report", sideEffectClass: "none" };

describe("routine domain", () => {
  it("separates a repeatable routine from candidate and automation state", () => {
    expect(validateRoutineDefinition(routine)).toEqual(routine);
    expect(createRoutineCandidate(routine, ["trace-1"]).status).toBe("candidate");
    expect(createDraftAutomation(routine, "schedule-1")).toMatchObject({ tier: "draft", enabled: false });
  });

  it("requires approval for side effects", () => {
    expect(() => validateRoutineDefinition({ ...routine, sideEffectClass: "external" })).toThrow("require approval");
  });
});
