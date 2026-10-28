import { createHash } from "node:crypto";
import { resolve } from "node:path";

export interface MemoryChange {
  destination: string;
  before: string | null;
  after: string | null;
}

export interface MemoryProposal {
  mode: "dry-run";
  approvalId: string;
  changes: readonly MemoryChange[];
  evidence: readonly string[];
  validation: readonly string[];
}

export interface MemoryApproval {
  confirmed?: boolean;
  approvedProposalId?: string;
}

/** Bind review to the exact batch, destinations, evidence and existing contents, without saving a proposal. */
export function createMemoryProposal(changes: readonly MemoryChange[], evidence: readonly string[], validation: readonly string[]): MemoryProposal {
  const sorted = changes.map((change) => ({ ...change, destination: resolve(change.destination) }))
    .sort((left, right) => left.destination.localeCompare(right.destination));
  if (new Set(sorted.map(({ destination }) => destination)).size !== sorted.length) throw new Error("duplicate memory proposal destination");
  const payload = { changes: sorted, evidence: [...evidence], validation: [...validation] };
  const approvalId = createHash("sha256").update(JSON.stringify(payload)).digest("hex");
  return { mode: "dry-run", approvalId, ...payload };
}

export function assertMemoryApproval(proposal: MemoryProposal, approval: MemoryApproval): void {
  if (approval.confirmed !== true) throw new Error("memory writes require explicit user confirmation after reviewing the dry run");
  if (approval.approvedProposalId !== proposal.approvalId) {
    throw new Error("memory proposal approval is missing or stale; review a fresh dry run before confirming");
  }
}

export function requestsMemoryApply(approval: MemoryApproval): boolean {
  return approval.confirmed !== undefined || approval.approvedProposalId !== undefined;
}
