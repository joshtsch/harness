import { findSensitiveContent } from "../sensitive-content.js";
import type { ArtifactCheck, OperationalEvent } from "./session-evaluation.js";

export type SessionFinalizationStatus = "success" | "failed" | "cancelled" | "interrupted";

export interface SessionReference { id: string; provenance: string; }

export interface SessionFeedback {
  id: string;
  source: "human" | "model" | "deterministic" | "eval";
  summary: string;
  proposedChange: string;
  expectedBenefit: string;
  risk: string;
  confidence: number;
  rollbackPath: string;
  verification: readonly string[];
}

export interface ObservedStateCheck { id: string; provenance: string; matches: boolean; }

export interface SessionFinalization {
  sessionId: string;
  traceId: string;
  projectKey: string;
  status: SessionFinalizationStatus;
  prompt: SessionReference;
  resolvedContext: SessionReference & { summary: string };
  events: readonly OperationalEvent[];
  artifacts: readonly ArtifactCheck[];
  feedback: readonly SessionFeedback[];
  observedState: readonly ObservedStateCheck[];
}

export type SessionFinalizationHook = (finalization: SessionFinalization) => void | Promise<void>;
export interface HookResult { ok: boolean; error?: string; }

function required(value: string, label: string): string {
  if (typeof value !== "string" || value.trim() === "") throw new Error(`${label} must be non-empty`);
  return value;
}

function score(value: number, label: string): number {
  if (!Number.isFinite(value) || value < 0 || value > 1) throw new Error(`${label} must be between 0 and 1`);
  return value;
}

function safe(value: unknown): void {
  if (findSensitiveContent(`+${JSON.stringify(value)}`).length > 0) throw new Error("session finalization contains sensitive content");
}

function belongsToTrace(provenance: string, traceId: string): boolean {
  return provenance === traceId || provenance.startsWith(`${traceId}:`);
}

function validateReference(reference: SessionReference, label: string, traceId: string): void {
  required(reference.id, `${label}.id`);
  required(reference.provenance, `${label}.provenance`);
  if (!belongsToTrace(reference.provenance, traceId)) throw new Error(`${label} escapes submitted trace`);
}

function validateFeedback(feedback: SessionFeedback): void {
  required(feedback.id, "feedback.id");
  required(feedback.summary, "feedback.summary");
  required(feedback.proposedChange, "feedback.proposedChange");
  required(feedback.expectedBenefit, "feedback.expectedBenefit");
  required(feedback.risk, "feedback.risk");
  required(feedback.rollbackPath, "feedback.rollbackPath");
  if (!("human model deterministic eval".split(" ").includes(feedback.source))) throw new Error("feedback.source is invalid");
  score(feedback.confidence, "feedback.confidence");
  if (!Array.isArray(feedback.verification) || feedback.verification.length === 0 || feedback.verification.some((value) => typeof value !== "string" || value.trim() === "")) throw new Error("feedback.verification must contain non-empty strings");
}

export function validateSessionFinalization(input: SessionFinalization): SessionFinalization {
  required(input.sessionId, "session finalization.sessionId");
  required(input.traceId, "session finalization.traceId");
  required(input.projectKey, "session finalization.projectKey");
  if (!("success failed cancelled interrupted".split(" ").includes(input.status))) throw new Error("session finalization.status is invalid");
  validateReference(input.prompt, "prompt", input.traceId);
  validateReference(input.resolvedContext, "resolved context", input.traceId);
  required(input.resolvedContext.summary, "resolved context.summary");
  if (!Array.isArray(input.events) || !Array.isArray(input.artifacts) || !Array.isArray(input.feedback) || !Array.isArray(input.observedState)) throw new Error("session finalization collections must be arrays");
  if (input.events.length === 0) throw new Error("session finalization requires operational events");
  for (const event of input.events) {
    if (event.sessionId !== input.sessionId) throw new Error("operational event escapes session");
    if (event.qualitySignals && Object.values(event.qualitySignals).some((value) => typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1)) throw new Error("event quality signals must be between 0 and 1");
  }
  for (const artifact of input.artifacts) {
    required(artifact.id, "artifact.id");
    required(artifact.provenance, "artifact.provenance");
    if (!belongsToTrace(artifact.provenance, input.traceId)) throw new Error("artifact escapes submitted trace");
  }
  for (const feedback of input.feedback) validateFeedback(feedback);
  for (const state of input.observedState) {
    required(state.id, "observed state.id");
    required(state.provenance, "observed state.provenance");
    if (!belongsToTrace(state.provenance, input.traceId)) throw new Error("observed state escapes submitted trace");
  }
  safe(input);
  return input;
}

export function createSessionFinalizer(): (input: SessionFinalization) => SessionFinalization {
  let finalized: SessionFinalization | undefined;
  return (input) => {
    const valid = validateSessionFinalization(input);
    if (finalized) {
      if (finalized.sessionId !== valid.sessionId || finalized.traceId !== valid.traceId) throw new Error("session finalization already emitted");
      return finalized;
    }
    finalized = valid;
    return finalized;
  };
}

export async function runSessionFinalizationHook(hook: SessionFinalizationHook, finalization: SessionFinalization): Promise<HookResult> {
  try {
    await hook(finalization);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: String(error) };
  }
}
