import { appendFile, mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { findSensitiveContent } from "../sensitive-content.js";

export type ObservationScope = "session" | "project";
export type ObservationKind = "observation" | "inference" | "recommendation";
export type ObservationStatus = "open" | "accepted" | "rejected" | "retired";
export type FeedbackSource = "human" | "model" | "deterministic" | "eval";

export interface RuntimeEvent {
  event: string;
  durationMs: number;
  result: "success" | "failure";
  failureCategory?: string;
  qualitySignals?: Readonly<Record<string, number>>;
}

export interface Observation {
  id: string;
  traceId: string;
  scope: ObservationScope;
  projectKey?: string;
  kind: ObservationKind;
  statement: string;
  hypothesis: string;
  evidence: readonly string[];
  feedback: readonly { source: FeedbackSource; summary: string }[];
  proposedChange: string;
  expectedBenefit: string;
  risk: string;
  confidence: number;
  rollbackPath: string;
  status: ObservationStatus;
  events: readonly RuntimeEvent[];
}

export type ObservationInput = Omit<Observation, "events"> & { events?: readonly RuntimeEvent[] };

function requiredText(value: string, label: string): string {
  if (typeof value !== "string" || value.trim() === "") throw new Error(`${label} must be non-empty`);
  if (value.length > 500) throw new Error(`${label} exceeds 500 characters`);
  return value;
}

function validateEvent(event: RuntimeEvent): RuntimeEvent {
  requiredText(event.event, "event.event");
  if (!Number.isFinite(event.durationMs) || event.durationMs < 0) throw new Error("event.durationMs must be non-negative and finite");
  if (event.result === "failure") requiredText(event.failureCategory ?? "", "event.failureCategory");
  if (event.result !== "success" && event.result !== "failure") throw new Error("event.result must be success or failure");
  return event;
}

function rejectSensitive(value: unknown): void {
  if (findSensitiveContent(`+${JSON.stringify(value)}`).length > 0) throw new Error("observation contains sensitive content");
}

export function createObservation(input: ObservationInput): Observation {
  requiredText(input.id, "observation.id");
  requiredText(input.traceId, "observation.traceId");
  requiredText(input.statement, "observation.statement");
  requiredText(input.hypothesis, "observation.hypothesis");
  requiredText(input.proposedChange, "observation.proposedChange");
  requiredText(input.expectedBenefit, "observation.expectedBenefit");
  requiredText(input.risk, "observation.risk");
  requiredText(input.rollbackPath, "observation.rollbackPath");
  if (input.scope === "project") requiredText(input.projectKey ?? "", "observation.projectKey");
  if (!Number.isFinite(input.confidence) || input.confidence < 0 || input.confidence > 1) throw new Error("observation.confidence must be between 0 and 1");
  if (input.evidence.length === 0) throw new Error("observation.evidence must not be empty");
  const observation: Observation = {
    ...input,
    ...(input.scope === "project" ? { projectKey: input.projectKey } : { projectKey: undefined }),
    events: (input.events ?? []).slice(0, 100).map(validateEvent),
  };
  rejectSensitive(observation);
  return observation;
}

export function addRuntimeEvent(observation: Observation, event: RuntimeEvent): Observation {
  if (observation.events.length >= 100) throw new Error("observation event limit exceeded");
  return createObservation({ ...observation, events: [...observation.events, event] });
}

export function observationStatePath(harnessRoot: string, sessionId: string): string {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/i.test(sessionId)) throw new Error("session ID must be a non-empty slug");
  return join(harnessRoot, "docs", ".scratch", "setup", sessionId, "observations.jsonl");
}

export async function appendObservation(harnessRoot: string, sessionId: string, observation: Observation): Promise<void> {
  const path = observationStatePath(harnessRoot, sessionId);
  await mkdir(join(harnessRoot, "docs", ".scratch", "setup", sessionId), { recursive: true });
  await appendFile(path, JSON.stringify(createObservation(observation)) + "\n", "utf8");
}

export async function loadObservations(harnessRoot: string, sessionId: string): Promise<Observation[]> {
  try {
    const content = await readFile(observationStatePath(harnessRoot, sessionId), "utf8");
    return content.split("\n").filter(Boolean).map((line) => createObservation(JSON.parse(line) as Observation));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}
