export type ExecutionTier = "observe" | "suggest" | "draft";
export type RoutineCandidateStatus = "candidate" | "accepted" | "rejected" | "deferred";
export type SideEffectClass = "none" | "external" | "durable";

export interface RoutineDefinition {
  id: string;
  owner: string;
  scope: "session" | "project" | "harness";
  inputContract: readonly string[];
  outputContract: readonly string[];
  successMeasures: readonly string[];
  requiredApproval: boolean;
  rollback: string;
  sideEffectClass: SideEffectClass;
}

export interface RoutineCandidate {
  id: string;
  routine: RoutineDefinition;
  evidenceIds: readonly string[];
  status: RoutineCandidateStatus;
}

export interface AutomationDefinition {
  id: string;
  routineId: string;
  tier: ExecutionTier;
  scheduleId: string;
  enabled: false;
}

function text(value: string, label: string): void {
  if (typeof value !== "string" || value.trim() === "") throw new Error(`${label} must be non-empty`);
}

export function validateRoutineDefinition(routine: RoutineDefinition): RoutineDefinition {
  text(routine.id, "routine.id");
  text(routine.owner, "routine.owner");
  text(routine.rollback, "routine.rollback");
  if (routine.inputContract.length === 0 || routine.outputContract.length === 0 || routine.successMeasures.length === 0) throw new Error("routine contracts and success measures are required");
  if (routine.sideEffectClass !== "none" && !routine.requiredApproval) throw new Error("side-effect routines require approval");
  return routine;
}

export function createRoutineCandidate(routine: RoutineDefinition, evidenceIds: readonly string[]): RoutineCandidate {
  validateRoutineDefinition(routine);
  if (evidenceIds.length === 0) throw new Error("routine candidate requires evidence");
  return { id: `candidate-${routine.id}`, routine, evidenceIds, status: "candidate" };
}

export function createDraftAutomation(routine: RoutineDefinition, scheduleId: string): AutomationDefinition {
  validateRoutineDefinition(routine);
  text(scheduleId, "automation.scheduleId");
  return { id: `automation-${routine.id}`, routineId: routine.id, tier: "draft", scheduleId, enabled: false };
}
