import { findSensitiveContent } from "../sensitive-content.js";
import type { ExecutionTier, SideEffectClass } from "./routine-domain.js";

export interface RoutineAuthorization {
  routineId: string;
  tier: ExecutionTier;
  sideEffectClass: SideEffectClass;
  scope: string;
  approved: boolean;
  authorized: boolean;
  expiresAt?: string;
  revoked: boolean;
}

export interface AuthorizationAudit {
  routineId: string;
  decision: "approved" | "revoked" | "rejected";
  reason: string;
  authority: string;
}

function text(value: string, label: string): void {
  if (typeof value !== "string" || value.trim() === "") throw new Error(`${label} must be non-empty`);
}

function active(auth: RoutineAuthorization, now: Date): boolean {
  return !auth.revoked && auth.approved && auth.authorized && (auth.expiresAt === undefined || new Date(auth.expiresAt).getTime() > now.getTime());
}

export function authorizeRoutine(input: Omit<RoutineAuthorization, "approved" | "authorized" | "revoked">): RoutineAuthorization {
  text(input.routineId, "authorization.routineId");
  text(input.scope, "authorization.scope");
  if (input.expiresAt !== undefined && Number.isNaN(new Date(input.expiresAt).getTime())) throw new Error("authorization.expiresAt must be valid");
  const authorization = { ...input, approved: true, authorized: true, revoked: false };
  if (findSensitiveContent(`+${JSON.stringify(authorization)}`).length > 0) throw new Error("authorization contains sensitive content");
  return authorization;
}

export function canExecute(auth: RoutineAuthorization, now = new Date()): boolean {
  return active(auth, now) && (auth.tier !== "observe" || auth.sideEffectClass === "none");
}

export function revokeAuthorization(auth: RoutineAuthorization, authority: string, reason: string): { authorization: RoutineAuthorization; audit: AuthorizationAudit } {
  text(authority, "authorization authority");
  text(reason, "authorization reason");
  return { authorization: { ...auth, authorized: false, revoked: true }, audit: { routineId: auth.routineId, decision: "revoked", reason, authority } };
}
