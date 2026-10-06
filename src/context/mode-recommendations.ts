import { CONTEXT_MODES, type ContextMode } from "./context-modes.js";

export type RecommendationConfidence = "high" | "medium" | "low";

export interface ModeEvidence {
  command?: string;
  issueLabels?: readonly string[];
  lifecycle?: "research" | "implementation" | "review" | "triage";
}

export interface ModeRecommendation {
  mode: ContextMode;
  confidence: RecommendationConfidence;
  evidence: readonly string[];
}

export interface ModeRecommendationResult {
  recommendation: ModeRecommendation;
  alternatives: readonly ModeRecommendation[];
  requiresConfirmation: true;
  observations: readonly {
    type: "recommendation" | "selection" | "rejection";
    mode: ContextMode;
    evidence: readonly string[];
  }[];
}

function explicitMode(command?: string): ContextMode | undefined {
  const value = command?.replace(/^\//, "").toLowerCase();
  return CONTEXT_MODES.includes(value as ContextMode) ? value as ContextMode : undefined;
}

function scoreEvidence(evidence: ModeEvidence): Map<ContextMode, string[]> {
  const scores = new Map<ContextMode, string[]>(CONTEXT_MODES.map((mode) => [mode, []]));
  const commandMode = explicitMode(evidence.command);
  if (commandMode) scores.get(commandMode)!.push(`explicit command: ${evidence.command}`);
  if (evidence.lifecycle) scores.get(evidence.lifecycle)!.push(`lifecycle: ${evidence.lifecycle}`);
  for (const label of evidence.issueLabels ?? []) {
    const normalized = label.toLowerCase();
    if (normalized === "needs-triage") scores.get("triage")!.push("issue label: needs-triage");
    if (normalized === "ready-for-agent") scores.get("implementation")!.push("issue label: ready-for-agent");
    if (normalized === "ready-for-human") scores.get("triage")!.push("issue label: ready-for-human");
  }
  return scores;
}

export function recommendMode(evidence: ModeEvidence): ModeRecommendationResult {
  const scored = [...scoreEvidence(evidence).entries()]
    .sort((left, right) => right[1].length - left[1].length);
  const [winner, ...rest] = scored;
  const winnerEvidence = winner[1];
  const confidence: RecommendationConfidence = winnerEvidence.length >= 2 ? "high" : winnerEvidence.length === 1 ? "medium" : "low";
  const recommendation = { mode: winner[0], confidence, evidence: winnerEvidence };
  const alternatives = rest.filter(([, signals]) => signals.length > 0).slice(0, 2)
    .map(([mode, signals]) => ({ mode, confidence: "medium" as const, evidence: signals }));
  return {
    recommendation,
    alternatives,
    requiresConfirmation: true,
    observations: [{ type: "recommendation", mode: winner[0], evidence: winnerEvidence }],
  };
}

export function recordModeSelection(result: ModeRecommendationResult, mode: ContextMode): ModeRecommendationResult {
  return { ...result, observations: [...result.observations, { type: "selection", mode, evidence: ["user confirmation"] }] };
}

export function recordModeRejection(result: ModeRecommendationResult): ModeRecommendationResult {
  return { ...result, observations: [...result.observations, { type: "rejection", mode: result.recommendation.mode, evidence: ["user rejection"] }] };
}
