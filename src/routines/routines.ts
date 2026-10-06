export type RoutineExecutionMode = "dry_run" | "execute";
export type SideEffectKind = "external" | "durable";

export interface RoutineContract<Input, Output> {
  id: string;
  version: string;
  inputs: readonly string[];
  outputs: readonly string[];
  tools: readonly string[];
  preconditions?: readonly string[];
  postconditions?: readonly string[];
  invariants?: readonly string[];
  outputValidator?: (output: Output) => boolean;
  failureBehavior: string;
}

export interface RoutineSideEffect {
  kind: SideEffectKind;
  target: string;
  action: string;
  applied: boolean;
}

export interface RoutineArtifact {
  id: string;
  valid: boolean;
  provenance: string;
}

export interface RoutineObservedState {
  id: string;
  matches: boolean;
  provenance: string;
}

export interface RoutineRun<Output> {
  mode: RoutineExecutionMode;
  output: Output;
  outputValid: boolean;
  sideEffects: readonly RoutineSideEffect[];
  artifacts: readonly RoutineArtifact[];
  observedState: readonly RoutineObservedState[];
  durationMs: number;
}

export type RoutineExecution<Output> = Omit<RoutineRun<Output>, "mode">;

export interface RoutineEvaluationSignals {
  safety: boolean;
  quality: number;
  efficiency: number;
  outcome: boolean;
  adaptability: number;
}

export interface RoutineEvaluationRequest<Output> {
  runId: string;
  provenance: string;
  baselineRunId?: string;
  run: RoutineRun<Output>;
  signals: RoutineEvaluationSignals;
}

export interface RoutineEvaluation {
  contractId: string;
  contractVersion: string;
  runId: string;
  provenance: string;
  baselineRunId?: string;
  signals: RoutineEvaluationSignals;
  outputValidation: { valid: boolean };
  artifactValidation: { valid: boolean; invalidIds: string[] };
  observedStateValidation: { valid: boolean; invalidIds: string[] };
  gates: { safety: "pass" | "fail"; outcome: "pass" | "fail" };
  status: "pass" | "fail";
  reviewStatus: "pending";
  regressionReady: false;
}

function requiredText(value: string, label: string): string {
  if (value.trim() === "" || value.includes("\n")) throw new Error(`${label} must be a single non-empty line`);
  return value;
}

function validateContract<Input, Output>(contract: RoutineContract<Input, Output>): void {
  requiredText(contract.id, "routine.id");
  requiredText(contract.version, "routine.version");
  requiredText(contract.failureBehavior, "routine.failureBehavior");
  for (const [name, values] of Object.entries({
    inputs: contract.inputs,
    outputs: contract.outputs,
    tools: contract.tools,
    preconditions: contract.preconditions ?? [],
    postconditions: contract.postconditions ?? [],
    invariants: contract.invariants ?? [],
  })) {
    if (values.some((value) => typeof value !== "string" || value.trim() === "")) {
      throw new Error(`routine.${name} must contain non-empty strings`);
    }
  }
}

function validateRun<Output>(run: RoutineRun<Output>): void {
  if (!Number.isFinite(run.durationMs) || run.durationMs < 0) throw new Error("routine run durationMs must be non-negative and finite");
  if (typeof run.outputValid !== "boolean") throw new Error("routine run outputValid must be a boolean");
  for (const sideEffect of run.sideEffects) {
    requiredText(sideEffect.target, "routine side effect target");
    requiredText(sideEffect.action, "routine side effect action");
  }
  for (const artifact of run.artifacts) {
    requiredText(artifact.id, "routine artifact id");
    requiredText(artifact.provenance, "routine artifact provenance");
  }
  for (const state of run.observedState) {
    requiredText(state.id, "routine observed state id");
    requiredText(state.provenance, "routine observed state provenance");
  }
}

export async function runRoutine<Input, Output>(
  contract: RoutineContract<Input, Output>,
  input: Input,
  execute: (input: Input, mode: RoutineExecutionMode) => Promise<RoutineExecution<Output>>,
): Promise<RoutineRun<Output>> {
  validateContract(contract);
  const mode = "dry_run" as const;
  const execution = await execute(input, mode);
  const run = { mode, ...execution, outputValid: contract.outputValidator?.(execution.output) ?? execution.outputValid };
  validateRun(run);
  if (!run.outputValid) throw new Error("routine output failed validation");
  if (run.sideEffects.some((sideEffect) => sideEffect.applied)) {
    throw new Error("dry run applied a side effect");
  }
  return run;
}

function score(value: number, label: string): number {
  if (!Number.isFinite(value) || value < 0 || value > 1) throw new Error(`${label} must be between 0 and 1`);
  return value;
}

export function evaluateRoutine<Input, Output>(
  contract: RoutineContract<Input, Output>,
  request: RoutineEvaluationRequest<Output>,
): RoutineEvaluation {
  validateContract(contract);
  validateRun(request.run);
  requiredText(request.runId, "routine evaluation runId");
  requiredText(request.provenance, "routine evaluation provenance");
  for (const [label, value] of Object.entries(request.signals)) {
    if (typeof value === "number") score(value, `routine evaluation signals.${label}`);
  }

  const invalidArtifactIds = request.run.artifacts.filter((artifact) => !artifact.valid).map((artifact) => artifact.id);
  const invalidStateIds = request.run.observedState.filter((state) => !state.matches).map((state) => state.id);
  const artifactValid = invalidArtifactIds.length === 0;
  const stateValid = invalidStateIds.length === 0;
  const safetyPassed = request.signals.safety && !request.run.sideEffects.some((sideEffect) => sideEffect.applied);
  const outcomePassed = request.signals.outcome && request.run.outputValid && artifactValid && stateValid;

  return {
    contractId: contract.id,
    contractVersion: contract.version,
    runId: request.runId,
    provenance: request.provenance,
    ...(request.baselineRunId === undefined ? {} : { baselineRunId: request.baselineRunId }),
    signals: request.signals,
    outputValidation: { valid: request.run.outputValid },
    artifactValidation: { valid: artifactValid, invalidIds: invalidArtifactIds },
    observedStateValidation: { valid: stateValid, invalidIds: invalidStateIds },
    gates: { safety: safetyPassed ? "pass" : "fail", outcome: outcomePassed ? "pass" : "fail" },
    status: safetyPassed && outcomePassed ? "pass" : "fail",
    reviewStatus: "pending",
    regressionReady: false,
  };
}
