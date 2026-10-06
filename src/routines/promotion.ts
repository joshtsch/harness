import { validatePromotionCandidate, type PromotionCandidate } from "./optimization-safety.js";

export interface RankedCandidate extends PromotionCandidate {
  expectedBenefit: number;
  confidence: number;
  cost: number;
  risk: number;
  evidenceStrength: number;
}

export interface ImplementationHandoff {
  executiveSummary: string;
  topChanges: readonly string[];
  supportingEvidence: readonly string[];
  validationGuidance: readonly string[];
  metadata: { candidateId: string; scope: PromotionCandidate["scope"]; status: "candidate" | "accepted" | "rejected" | "retired"; traceId?: string; sessionId?: string; feedbackId?: string; proposedChange?: string; provenance?: { prompt: string; context: { id: string; provenance: string }; artifacts: readonly { id: string; provenance: string }[]; observedState: readonly { id: string; provenance: string }[] } };
}

function score(value: number, label: string): number {
  if (!Number.isFinite(value) || value < 0 || value > 1) throw new Error(`${label} must be between 0 and 1`);
  return value;
}

export function validateRankedCandidate(candidate: RankedCandidate): RankedCandidate {
  validatePromotionCandidate(candidate);
  score(candidate.expectedBenefit, "candidate.expectedBenefit");
  score(candidate.confidence, "candidate.confidence");
  score(candidate.cost, "candidate.cost");
  score(candidate.risk, "candidate.risk");
  score(candidate.evidenceStrength, "candidate.evidenceStrength");
  return candidate;
}

export function rankCandidates(candidates: readonly RankedCandidate[]): RankedCandidate[] {
  candidates.forEach(validateRankedCandidate);
  return [...candidates].sort((left, right) => {
    const score = (candidate: RankedCandidate) => candidate.expectedBenefit * candidate.confidence * candidate.evidenceStrength - candidate.cost - candidate.risk;
    return score(right) - score(left);
  });
}

export function createImplementationHandoff(candidate: RankedCandidate, status: ImplementationHandoff["metadata"]["status"] = "candidate"): ImplementationHandoff {
  validateRankedCandidate(candidate);
  return {
    executiveSummary: candidate.summary,
    topChanges: [candidate.summary],
    supportingEvidence: candidate.evidenceIds,
    validationGuidance: candidate.verification,
    metadata: { candidateId: candidate.id, scope: candidate.scope, status },
  };
}
