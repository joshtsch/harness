import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { randomUUID } from "node:crypto";
import { evaluateSession, type OperationalEvent, type SessionEvaluation } from "../session/session-evaluation.js";
import { createObservation, type Observation, type ObservationInput } from "../routines/observations.js";
import { appendObservation, loadObservations, observationStatePath } from "../routines/observations.js";
import {
  createImplementationHandoff,
  rankCandidates,
  type ImplementationHandoff,
  type RankedCandidate,
} from "../routines/promotion.js";
import { validatePromotionCandidate } from "../routines/optimization-safety.js";
import { findSensitiveContent } from "../sensitive-content.js";
import type { SessionFinalizationHook } from "../session/session-finalization.js";
import { collectSessionEvidence } from "./session-evidence.js";
import { collectRuleSuggestions, type RuleSignal, type RuleSuggestion } from "../rule-suggestions.js";
export { collectSessionEvidence } from "./session-evidence.js";

type SessionEvaluationInput = Parameters<typeof evaluateSession>[0];
const persistenceLocks = new Map<string, Promise<void>>();

export interface OptimizationSubmission {
  observations: readonly ObservationInput[];
  evaluation: SessionEvaluationInput;
  candidates: readonly RankedCandidate[];
}

export interface OptimizationResult {
  observations: readonly Observation[];
  evaluation: SessionEvaluation;
  rankedCandidates: readonly RankedCandidate[];
  handoff: ImplementationHandoff | null;
  ruleSuggestions: readonly RuleSuggestion[];
}

export interface PromptSessionFeedback {
  id: string;
  source: Observation["feedback"][number]["source"];
  summary: string;
  proposedChange: string;
  expectedBenefit: string;
  risk: string;
  confidence: number;
  rollbackPath: string;
  verification: readonly string[];
  scope: RankedCandidate["scope"];
  expectedBenefitScore: number;
  cost: number;
  riskScore: number;
  evidenceStrength: number;
}

export interface PromptSessionInput {
  harnessRoot: string;
  sessionId: string;
  traceId: string;
  projectKey: string;
  prompt: string;
  resolvedContext: { id: string; provenance: string; summary: string };
  events: readonly OperationalEvent[];
  artifacts: readonly { id: string; provenance: string; exists: boolean; valid: boolean }[];
  feedback: readonly PromptSessionFeedback[];
  observedState: readonly { id: string; provenance: string; matches: boolean }[];
  ruleSignals?: readonly RuleSignal[];
  signals?: Partial<SessionEvaluationInput["rawSignals"]>;
}

function validateEvidence(observations: readonly Observation[], candidate: RankedCandidate): void {
  const observationIds = new Set(observations.map(({ id }) => id));
  if (candidate.evidenceIds.some((id) => !observationIds.has(id))) {
    throw new Error(`candidate ${candidate.id} references unknown observation evidence`);
  }
}

/** Submit scoped evidence and receive a ranked, safety-gated review handoff. */
export function submitOptimization(input: OptimizationSubmission): OptimizationResult {
  const observations = input.observations.map(createObservation);
  const ids = new Set<string>();
  for (const observation of observations) {
    if (ids.has(observation.id)) throw new Error(`duplicate observation id: ${observation.id}`);
    ids.add(observation.id);
  }

  const evaluation = evaluateSession(input.evaluation);
  for (const candidate of input.candidates) {
    validatePromotionCandidate(candidate);
    validateEvidence(observations, candidate);
  }

  const rankedCandidates = rankCandidates(input.candidates);
  const topCandidate = rankedCandidates[0];
  const handoff = evaluation.status === "pass" && topCandidate
    ? createImplementationHandoff(topCandidate)
    : null;

  return { observations, evaluation, rankedCandidates, handoff, ruleSuggestions: [] };
}

function ruleSuggestionStatePath(harnessRoot: string, sessionId: string): string {
  return join(harnessRoot, "docs", ".scratch", "setup", sessionId, "rule-suggestions.jsonl");
}

function required(value: string, label: string): string {
  if (typeof value !== "string" || value.trim() === "") throw new Error(`${label} must be non-empty`);
  return value;
}

function belongsToTrace(provenance: string, traceId: string): boolean {
  return provenance === traceId || provenance.startsWith(`${traceId}:`);
}

function score(value: number, label: string): number {
  if (!Number.isFinite(value) || value < 0 || value > 1) throw new Error(`${label} must be between 0 and 1`);
  return value;
}

function validateFeedbackShape(item: PromptSessionFeedback): void {
  required(item.id, "feedback.id");
  if (!("human model deterministic eval".split(" ").includes(item.source))) throw new Error("feedback.source is invalid");
  if (!("session project harness".split(" ").includes(item.scope))) throw new Error("feedback.scope is invalid");
  if (!Array.isArray(item.verification) || item.verification.length === 0 || item.verification.some((value) => typeof value !== "string" || value.trim() === "")) throw new Error("feedback.verification must contain non-empty strings");
}

async function recoverStaleRecovery(recoveryPath: string): Promise<void> {
  try {
    const marker = await readFile(join(recoveryPath, "owner"), "utf8").catch(() => "");
    const owner = Number.parseInt(marker, 10);
    let stale = Date.now() - (await stat(recoveryPath)).mtimeMs > 60_000;
    if (Number.isInteger(owner)) {
      try { process.kill(owner, 0); stale = false; } catch (error) { if ((error as NodeJS.ErrnoException).code === "ESRCH") stale = true; }
    }
    if (stale) {
      const quarantine = `${recoveryPath}.${randomUUID()}.stale`;
      await rename(recoveryPath, quarantine);
      await rm(quarantine, { recursive: true, force: true });
    }
  } catch {
    // The recovery marker may have been removed by another waiter.
  }
}

async function withPersistenceLock<T>(statePath: string, action: () => Promise<T>): Promise<T> {
  const lockPath = `${statePath}.lock`;
  await mkdir(dirname(statePath), { recursive: true });
  for (let attempt = 0; attempt < 6000; attempt += 1) {
    try {
      const token = `${process.pid}:${randomUUID()}`;
      await mkdir(lockPath);
      try {
        await writeFile(join(lockPath, "owner"), token, "utf8");
        return await action();
      } finally {
        if (await readFile(join(lockPath, "owner"), "utf8").catch(() => "") === token) await rm(lockPath, { recursive: true, force: true });
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      try {
        const marker = await readFile(join(lockPath, "owner"), "utf8");
        const owner = Number.parseInt(marker, 10);
        if (Number.isInteger(owner)) {
          try {
            process.kill(owner, 0);
          } catch (ownerError) {
            if ((ownerError as NodeJS.ErrnoException).code === "ESRCH") {
                const recoveryPath = `${lockPath}.recovery`;
              try {
                await mkdir(recoveryPath);
                const recoveryToken = `${process.pid}:${randomUUID()}`;
                await writeFile(join(recoveryPath, "owner"), recoveryToken, "utf8");
                try {
                  if (await readFile(join(lockPath, "owner"), "utf8").catch(() => "") === marker) {
                    const stalePath = `${lockPath}.${randomUUID()}.stale`;
                    await rename(lockPath, stalePath);
                    await rm(stalePath, { recursive: true, force: true });
                  }
                } finally {
                  if (await readFile(join(recoveryPath, "owner"), "utf8").catch(() => "") === recoveryToken) await rm(recoveryPath, { recursive: true, force: true });
                }
              } catch {
                await recoverStaleRecovery(recoveryPath);
              }
            }
          }
        } else if (Date.now() - (await stat(lockPath)).mtimeMs > 60_000) {
            const recoveryPath = `${lockPath}.recovery`;
          try {
            await mkdir(recoveryPath);
            const recoveryToken = `${process.pid}:${randomUUID()}`;
            await writeFile(join(recoveryPath, "owner"), recoveryToken, "utf8");
            try {
              if (await stat(lockPath).then(({ mtimeMs }) => Date.now() - mtimeMs > 60_000).catch(() => false)) {
                const stalePath = `${lockPath}.${randomUUID()}.stale`;
                await rename(lockPath, stalePath);
                await rm(stalePath, { recursive: true, force: true });
              }
            } finally {
              if (await readFile(join(recoveryPath, "owner"), "utf8").catch(() => "") === recoveryToken) await rm(recoveryPath, { recursive: true, force: true });
            }
          } catch {
            await recoverStaleRecovery(recoveryPath);
          }
        }
      } catch {
        // The owner may be between creating and writing the lock marker.
      }
      await delay(10);
    }
  }
  throw new Error("observation persistence lock timed out");
}

/** Convert one prompt/session trace into redacted, persisted optimization evidence. */
export async function adaptPromptSession(input: PromptSessionInput): Promise<OptimizationResult> {
  if (!input || typeof input !== "object") throw new Error("prompt session input must be an object");
  required(input.harnessRoot, "prompt session harnessRoot");
  required(input.sessionId, "prompt session sessionId");
  required(input.traceId, "prompt session traceId");
  required(input.projectKey, "prompt session projectKey");
  required(input.prompt, "prompt session prompt");
  if (!input.resolvedContext || typeof input.resolvedContext !== "object") throw new Error("resolved context must be an object");
  required(input.resolvedContext.id, "resolved context id");
  required(input.resolvedContext.provenance, "resolved context provenance");
  required(input.resolvedContext.summary, "resolved context summary");
  if (!Array.isArray(input.events) || !Array.isArray(input.artifacts) || !Array.isArray(input.feedback ?? []) || !Array.isArray(input.observedState)) throw new Error("prompt session collections must be arrays");
  for (const event of input.events) {
    if (!event || typeof event !== "object") throw new Error("operational event must be an object");
    if (event.qualitySignals !== undefined && (!event.qualitySignals || typeof event.qualitySignals !== "object" || Array.isArray(event.qualitySignals) || Object.values(event.qualitySignals).some((value) => typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1))) throw new Error("event quality signals must be between 0 and 1");
  }
  for (const item of input.artifacts) if (!item || typeof item !== "object") throw new Error("artifact must be an object");
  for (const item of input.observedState) if (!item || typeof item !== "object") throw new Error("observed state must be an object");
  for (const item of input.feedback) if (!item || typeof item !== "object") throw new Error("feedback must be an object");
  for (const artifact of input.artifacts) {
    required(artifact.id, "artifact id");
    required(artifact.provenance, "artifact provenance");
    if (typeof artifact.exists !== "boolean" || typeof artifact.valid !== "boolean") throw new Error("artifact validity flags must be boolean");
  }
  for (const state of input.observedState) {
    required(state.id, "observed state id");
    required(state.provenance, "observed state provenance");
    if (typeof state.matches !== "boolean") throw new Error("observed state matches must be boolean");
  }
  if (!belongsToTrace(input.resolvedContext.provenance, input.traceId)) throw new Error("resolved context provenance escapes submitted trace");
  for (const event of input.events) {
    if (event.sessionId !== input.sessionId || event.projectKey !== input.projectKey) throw new Error("operational event escapes submitted session");
  }
  for (const item of [...input.artifacts, ...input.observedState]) {
    if (!belongsToTrace(item.provenance, input.traceId)) throw new Error(`${item.id} provenance escapes submitted trace`);
  }
  if (findSensitiveContent(`+${JSON.stringify(input)}`).length > 0) throw new Error("prompt session contains sensitive content");
  const detectedRuleSuggestions = collectRuleSuggestions(input.prompt, input.ruleSignals ?? []);

  const feedback = input.feedback;
  feedback.forEach(validateFeedbackShape);
  const feedbackIds = new Set<string>();
  for (const item of feedback) {
    if (feedbackIds.has(item.id)) throw new Error(`duplicate feedback id: ${item.id}`);
    feedbackIds.add(item.id);
  }
  const referencedIds = new Set<string>();
  for (const item of [...input.artifacts, ...input.observedState]) {
    required(item.id, "session evidence id");
    if (referencedIds.has(item.id)) throw new Error(`duplicate session evidence id: ${item.id}`);
    referencedIds.add(item.id);
  }
  const evidence = [
    `${input.traceId}:prompt`,
    input.resolvedContext.provenance,
    ...input.events.map((_, index) => `${input.traceId}:event-${index + 1}`),
    ...input.artifacts.map(({ provenance }) => provenance),
    ...input.observedState.map(({ provenance }) => provenance),
  ];
  const observations = feedback.map((item) => ({
    id: `observation-${input.traceId}-${item.id}`,
    traceId: input.traceId,
    scope: "session" as const,
    kind: "observation" as const,
    statement: item.summary,
    hypothesis: item.proposedChange,
    evidence,
    feedback: [{ source: item.source, summary: item.summary }],
    proposedChange: item.proposedChange,
    expectedBenefit: item.expectedBenefit,
    risk: item.risk,
    confidence: item.confidence,
    rollbackPath: item.rollbackPath,
    status: "open" as const,
    events: input.events.map(({ event, durationMs, result, failureCategory, qualitySignals }) => ({ event, durationMs, result, failureCategory, qualitySignals })),
  } satisfies ObservationInput));
  const candidates = feedback.map((item, index) => ({
    id: `candidate-${input.traceId}-${item.id}`,
    scope: item.scope,
    summary: item.proposedChange,
    evidenceIds: [`observation-${input.traceId}-${item.id}`],
    rollbackPath: item.rollbackPath,
    verification: item.verification,
    changesPolicy: false,
    changesPermissions: false,
    changesSafety: false,
    expectedBenefit: score(item.expectedBenefitScore, "feedback.expectedBenefitScore"),
    confidence: item.confidence,
    cost: score(item.cost, "feedback.cost"),
    risk: score(item.riskScore, "feedback.riskScore"),
    evidenceStrength: score(item.evidenceStrength, "feedback.evidenceStrength"),
    payload: { traceId: input.traceId, feedbackId: item.id, evidenceIndex: index },
  } satisfies RankedCandidate));
  const failedEvent = input.events.some(({ result }) => result === "failure");
  const invalidArtifact = input.artifacts.some(({ exists, valid }) => !exists || !valid);
  const invalidState = input.observedState.some(({ matches }) => !matches);
  const signals = {
    quality: 1,
    efficiency: 1,
    adaptability: 1,
    ...input.signals,
    safety: failedEvent || invalidArtifact ? 0 : input.signals?.safety ?? 1,
    outcome: failedEvent || invalidArtifact || invalidState ? 0 : input.signals?.outcome ?? 1,
  };
  const baseResult = submitOptimization({
    observations,
    candidates,
    evaluation: { events: input.events, artifactChecks: input.artifacts, rawSignals: signals },
  });
  let ruleSuggestions: RuleSuggestion[] = [];
  const result: OptimizationResult = { ...baseResult, ruleSuggestions };
  const statePath = observationStatePath(input.harnessRoot, input.sessionId);
  const previous = persistenceLocks.get(statePath) ?? Promise.resolve();
  const persist = previous.catch(() => undefined).then(() => withPersistenceLock(statePath, async () => {
    const persisted = new Map<string, string>();
    for (const observation of await loadObservations(input.harnessRoot, input.sessionId)) {
      if (persisted.has(observation.id)) throw new Error(`duplicate persisted observation id: ${observation.id}`);
      persisted.set(observation.id, JSON.stringify(observation));
    }
    for (const observation of result.observations) {
      const serialized = JSON.stringify(observation);
      if (persisted.has(observation.id)) {
        if (persisted.get(observation.id) !== serialized) throw new Error(`observation persistence conflict: ${observation.id}`);
      } else {
        await appendObservation(input.harnessRoot, input.sessionId, observation);
      }
    }
    const suggestionPath = ruleSuggestionStatePath(input.harnessRoot, input.sessionId);
    let persistedSuggestions: RuleSuggestion[] = [];
    try {
      const source = await readFile(suggestionPath, "utf8");
      persistedSuggestions = source.trim().split("\n").filter(Boolean).map((line) => JSON.parse(line) as RuleSuggestion);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    const persistedIds = new Set(persistedSuggestions.map(({ id }) => id));
    ruleSuggestions = detectedRuleSuggestions.filter(({ id }) => !persistedIds.has(id));
    result.ruleSuggestions = ruleSuggestions;
    if (ruleSuggestions.length > 0) {
      await writeFile(suggestionPath, `${[...persistedSuggestions, ...ruleSuggestions].map((suggestion) => JSON.stringify(suggestion)).join("\n")}\n`, "utf8");
    }
  }));
  persistenceLocks.set(statePath, persist);
  try {
    await persist;
  } finally {
    if (persistenceLocks.get(statePath) === persist) persistenceLocks.delete(statePath);
  }
  const winningFeedback = result.handoff && input.feedback.find((item) => `candidate-${input.traceId}-${item.id}` === result.handoff?.metadata.candidateId);
  return result.handoff
    ? {
      ...result,
      handoff: {
        ...result.handoff,
        metadata: {
          ...result.handoff.metadata,
          traceId: input.traceId,
          sessionId: input.sessionId,
          provenance: {
            prompt: `${input.traceId}:prompt`,
            context: { id: input.resolvedContext.id, provenance: input.resolvedContext.provenance },
            artifacts: input.artifacts.map(({ id, provenance }) => ({ id, provenance })),
            observedState: input.observedState.map(({ id, provenance }) => ({ id, provenance })),
          },
          ...(winningFeedback ? { feedbackId: winningFeedback.id, proposedChange: winningFeedback.proposedChange } : {}),
        },
      },
    }
    : result;
}

export interface SessionOptimizationHookOptions {
  harnessRoot: string;
  enabled?: boolean;
  onDiagnostic?: (diagnostic: { sessionId: string; traceId: string; error: string }) => void | Promise<void>;
  onRuleSuggestion?: (suggestion: RuleSuggestion) => void | Promise<void>;
}

/** Create the best-effort, review-only optimization hook for a finalized session. */
export function createSessionOptimizationHook(options: SessionOptimizationHookOptions): SessionFinalizationHook {
  return async (finalization) => {
    if (options.enabled === false) return;
    try {
      const result = await adaptPromptSession(collectSessionEvidence(options, finalization));
      for (const suggestion of result.ruleSuggestions) await options.onRuleSuggestion?.(suggestion);
    } catch (error) {
      await options.onDiagnostic?.({ sessionId: finalization.sessionId, traceId: finalization.traceId, error: String(error) });
    }
  };
}
