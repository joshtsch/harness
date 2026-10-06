import { findSensitiveContent } from "../sensitive-content.js";
import { createRoutineCandidate, type RoutineCandidate, type RoutineDefinition } from "./routine-domain.js";

export interface TaskTrace {
  id: string;
  projectKey: string;
  fingerprint: string;
  tools: readonly string[];
  inputSummary: string;
  outputSummary: string;
  durationMs: number;
  approvalPoints: readonly string[];
  failures: readonly string[];
  sideEffects: readonly string[];
}

export interface RoutineDiscoveryRequest {
  traces: readonly TaskTrace[];
  confirmedFingerprints: readonly string[];
}

export interface DiscoveredRoutine extends RoutineCandidate {
  provenance: readonly string[];
  likelySchedule: string;
  risks: readonly string[];
}

function validTrace(trace: TaskTrace): void {
  if (findSensitiveContent(`+${JSON.stringify(trace)}`).length > 0) throw new Error("trace contains sensitive content");
  if (!Number.isFinite(trace.durationMs) || trace.durationMs < 0) throw new Error("trace.durationMs must be non-negative and finite");
}

export function discoverRoutineCandidates(request: RoutineDiscoveryRequest): DiscoveredRoutine[] {
  request.traces.forEach(validTrace);
  const confirmed = new Set(request.confirmedFingerprints);
  const groups = new Map<string, TaskTrace[]>();
  for (const trace of request.traces) {
    if (!confirmed.has(trace.fingerprint)) continue;
    const key = `${trace.projectKey}:${trace.fingerprint}`;
    groups.set(key, [...(groups.get(key) ?? []), trace]);
  }
  return [...groups.values()].filter((traces) => traces.length >= 2).map((traces) => {
    const first = traces[0];
    const routine: RoutineDefinition = {
      id: first.fingerprint,
      owner: first.projectKey,
      scope: "project",
      inputContract: ["redacted trace input summary"],
      outputContract: ["redacted trace output summary"],
      successMeasures: ["repeated successful completion", "reviewed side-effect report"],
      requiredApproval: first.sideEffects.length > 0,
      rollback: "reject candidate or remove approved routine",
      sideEffectClass: first.sideEffects.length > 0 ? "external" : "none",
    };
    return {
      ...createRoutineCandidate(routine, traces.map(({ id }) => id)),
      provenance: traces.map(({ id }) => id),
      likelySchedule: "derive only after schedule review",
      risks: ["candidate is not enabled", ...(first.failures.length > 0 ? ["prior failures require review"] : [])],
    };
  });
}
