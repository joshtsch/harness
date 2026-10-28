import { describe, expect, it } from "vitest";
import { assertMemoryApproval, createMemoryProposal } from "../src/memory-proposal.js";

const changes = [
  { destination: "/vault/wiki/one.md", before: "old", after: "new" },
  { destination: "/vault/wiki/index.md", before: null, after: "one.md" },
];
const proposal = () => createMemoryProposal(changes, ["user instruction"], ["scope, privacy and links checked"]);

describe("memory proposal approvals", () => {
  it("requires separate confirmation and the fingerprint of the full reviewed batch", () => {
    const review = proposal();
    expect(() => assertMemoryApproval(review, {})).toThrow("explicit user confirmation");
    expect(() => assertMemoryApproval(review, { confirmed: true })).toThrow("missing or stale");
    expect(() => assertMemoryApproval(review, { confirmed: false, approvedProposalId: review.approvalId })).toThrow("explicit user confirmation");
    expect(() => assertMemoryApproval(review, { confirmed: true, approvedProposalId: review.approvalId })).not.toThrow();
  });

  it("invalidates approval after content, destination, evidence, existing state, or batch membership changes", () => {
    const approval = { confirmed: true, approvedProposalId: proposal().approvalId };
    for (const changed of [
      createMemoryProposal([{ ...changes[0], after: "different" }, changes[1]], ["user instruction"], ["scope, privacy and links checked"]),
      createMemoryProposal([{ ...changes[0], destination: "/other/one.md" }, changes[1]], ["user instruction"], ["scope, privacy and links checked"]),
      createMemoryProposal([{ ...changes[0], before: "changed since review" }, changes[1]], ["user instruction"], ["scope, privacy and links checked"]),
      createMemoryProposal(changes, ["different evidence"], ["scope, privacy and links checked"]),
      createMemoryProposal(changes.slice(0, 1), ["user instruction"], ["scope, privacy and links checked"]),
    ]) expect(() => assertMemoryApproval(changed, approval)).toThrow("missing or stale");
    expect(createMemoryProposal([...changes].reverse(), ["user instruction"], ["scope, privacy and links checked"]).approvalId).toBe(proposal().approvalId);
  });
});
