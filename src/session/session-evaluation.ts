import { findSensitiveContent } from "../sensitive-content.js";

export interface OperationalEvent {
  sessionId: string;
  projectKey: string;
  mode: string;
  skill: string;
  event: string;
  durationMs: number;
  result: "success" | "failure";
  failureCategory?: string;
  qualitySignals?: Readonly<Record<string, number>>;
}

export interface EvalCase {
  id: string;
  sourceObservationIds: readonly string[];
  theme: string;
  status: "proposed" | "approved";
}

export interface ArtifactCheck {
  id: string;
  provenance: string;
  exists: boolean;
  valid: boolean;
}

export interface SessionEvaluation {
  rawSignals: Readonly<Record<"safety" | "quality" | "efficiency" | "outcome" | "adaptability", number>>;
  baseline?: Readonly<Record<string, number>>;
  gates: { safety: "pass" | "fail"; outcome: "pass" | "fail" };
  status: "pass" | "fail";
  artifactChecks: readonly ArtifactCheck[];
}

function required(value: string, label: string): string {
  if (typeof value !== "string" || value.trim() === "") throw new Error(`${label} must be non-empty`);
  return value;
}

function safe(value: unknown): void {
  if (findSensitiveContent(`+${JSON.stringify(value)}`).length > 0) throw new Error("evaluation contains sensitive content");
}

export function recordOperationalEvent(event: OperationalEvent): OperationalEvent {
  required(event.sessionId, "event.sessionId");
  required(event.projectKey, "event.projectKey");
  required(event.mode, "event.mode");
  required(event.skill, "event.skill");
  required(event.event, "event.event");
  if (!Number.isFinite(event.durationMs) || event.durationMs < 0) throw new Error("event.durationMs must be non-negative and finite");
  safe(event);
  return event;
}

export function generateEvalCase(theme: string, observationIds: readonly string[]): EvalCase {
  required(theme, "eval theme");
  if (observationIds.length < 2) throw new Error("generated eval requires repeated observation evidence");
  return { id: `eval-${observationIds.join("-")}`, sourceObservationIds: observationIds, theme, status: "proposed" };
}

export function approveEvalCase(evalCase: EvalCase): EvalCase {
  return { ...evalCase, status: "approved" };
}

export function validateArtifact(artifact: ArtifactCheck): ArtifactCheck {
  required(artifact.id, "artifact.id");
  required(artifact.provenance, "artifact.provenance");
  safe(artifact);
  return { ...artifact, valid: artifact.exists && artifact.valid };
}

export function evaluateSession(input: {
  events: readonly OperationalEvent[];
  artifactChecks: readonly ArtifactCheck[];
  rawSignals: SessionEvaluation["rawSignals"];
  baseline?: Readonly<Record<string, number>>;
}): SessionEvaluation {
  const events = input.events.map(recordOperationalEvent);
  const artifactChecks = input.artifactChecks.map(validateArtifact);
  if (events.length === 0) throw new Error("session evaluation requires operational events");
  for (const value of Object.values(input.rawSignals)) {
    if (!Number.isFinite(value) || value < 0 || value > 1) throw new Error("evaluation signals must be between 0 and 1");
  }
  const gates = {
    safety: input.rawSignals.safety >= 1 && artifactChecks.every((artifact) => artifact.valid) ? "pass" as const : "fail" as const,
    outcome: input.rawSignals.outcome >= 1 ? "pass" as const : "fail" as const,
  };
  return { rawSignals: input.rawSignals, ...(input.baseline ? { baseline: input.baseline } : {}), gates, status: gates.safety === "pass" && gates.outcome === "pass" ? "pass" : "fail", artifactChecks };
}
