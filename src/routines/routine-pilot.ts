import type { RoutineContract, RoutineExecution, RoutineEvaluation, RoutineRun } from "./routines.js";
import { evaluateRoutine, runRoutine } from "./routines.js";
import type { ScheduleLifecycle } from "../schedules/index.js";

export interface ReadOnlyPilotResult<Output> {
  run: RoutineRun<Output>;
  evaluation: RoutineEvaluation;
  baseline?: RoutineEvaluation;
  report: { artifactId: string; content: Output; provenance: string };
  schedule: ScheduleLifecycle;
  goNoGo: "go" | "no-go";
  feedback: readonly string[];
}

export async function runReadOnlyPilot<Input, Output>(options: {
  contract: RoutineContract<Input, Output>;
  input: Input;
  execute: (input: Input, mode: "dry_run" | "execute") => Promise<RoutineExecution<Output>>;
  runId: string;
  provenance: string;
  baseline?: RoutineEvaluation;
  schedule: ScheduleLifecycle;
  artifactId: string;
}): Promise<ReadOnlyPilotResult<Output>> {
  const run = await runRoutine(options.contract, options.input, options.execute);
  const evaluation = evaluateRoutine(options.contract, { runId: options.runId, provenance: options.provenance, run, signals: { safety: true, quality: 1, efficiency: 1, outcome: true, adaptability: 1 } });
  return {
    run,
    evaluation,
    ...(options.baseline ? { baseline: options.baseline } : {}),
    report: { artifactId: options.artifactId, content: run.output, provenance: options.provenance },
    schedule: options.schedule,
    goNoGo: evaluation.status === "pass" && options.schedule.state !== "cancelled" ? "go" : "no-go",
    feedback: [],
  };
}
