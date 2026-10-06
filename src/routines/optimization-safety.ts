import { findSensitiveContent } from "../sensitive-content.js";

export type PromotionDecision = "accepted" | "rejected";

export interface PromotionCandidate {
  id: string;
  scope: "session" | "project" | "harness";
  summary: string;
  evidenceIds: readonly string[];
  rollbackPath: string;
  verification: readonly string[];
  changesPolicy: boolean;
  changesPermissions: boolean;
  changesSafety: boolean;
  payload?: unknown;
}

export interface PromotionAudit {
  candidateId: string;
  decision: PromotionDecision;
  reason: string;
  reviewer: string;
}

function text(value: string, label: string): string {
  if (typeof value !== "string" || value.trim() === "") throw new Error(`${label} must be non-empty`);
  return value;
}

export function validatePromotionCandidate(candidate: PromotionCandidate): PromotionCandidate {
  text(candidate.id, "candidate.id");
  text(candidate.summary, "candidate.summary");
  text(candidate.rollbackPath, "candidate.rollbackPath");
  if (!("session project harness".split(" ").includes(candidate.scope))) throw new Error("candidate.scope is invalid");
  if (!Array.isArray(candidate.evidenceIds) || candidate.evidenceIds.length === 0 || candidate.evidenceIds.some((id) => typeof id !== "string" || id.trim() === "")) throw new Error("candidate evidence must contain non-empty strings");
  if (!Array.isArray(candidate.verification) || candidate.verification.length === 0 || candidate.verification.some((step) => typeof step !== "string" || step.trim() === "")) throw new Error("candidate verification must contain non-empty strings");
  if (typeof candidate.changesPolicy !== "boolean" || typeof candidate.changesPermissions !== "boolean" || typeof candidate.changesSafety !== "boolean") throw new Error("candidate policy flags must be boolean");
  if (candidate.changesPolicy || candidate.changesPermissions || candidate.changesSafety) throw new Error("optimization cannot weaken policy, permissions, or safety");
  if (findSensitiveContent(`+${JSON.stringify(candidate)}`).length > 0) throw new Error("candidate contains sensitive content");
  return candidate;
}

export function decidePromotion(candidate: PromotionCandidate, decision: PromotionDecision, reviewer: string, reason: string): PromotionAudit {
  validatePromotionCandidate(candidate);
  text(reviewer, "reviewer");
  text(reason, "reason");
  return { candidateId: candidate.id, decision, reason, reviewer };
}
