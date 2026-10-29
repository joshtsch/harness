import { createHash } from "node:crypto";
import { basename, dirname, resolve } from "node:path";
import { lstat, realpath } from "node:fs/promises";

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

/** Resolve existing ancestors without creating a missing destination. Dangling links fail closed. */
export async function resolveMemoryDestination(destination: string): Promise<string> {
  let ancestor = resolve(destination);
  const missing: string[] = [];
  for (;;) {
    try { return resolve(await realpath(ancestor), ...missing); } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      try {
        await lstat(ancestor);
        throw new Error("memory destination contains an unresolved symbolic link");
      } catch (infoError) {
        if ((infoError as NodeJS.ErrnoException).code !== "ENOENT") throw infoError;
      }
      const parent = dirname(ancestor);
      if (parent === ancestor) throw new Error("memory destination has no accessible ancestor");
      missing.unshift(basename(ancestor));
      ancestor = parent;
    }
  }
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
