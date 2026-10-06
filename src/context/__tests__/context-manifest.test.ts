import { describe, expect, it } from "vitest";
import { createContextManifest } from "../index.js";

const contract = {
  instructions: [{ id: "policy", source: "AGENTS.md", summary: "Follow repository safety rules" }],
  tools: [{ id: "git", source: "workflow", summary: "Use Git for repository changes" }],
  routing: [{ id: "review", source: "agent-roles", summary: "Route review work to code review" }],
  outputRequirements: [{ id: "links", source: "app-context", summary: "Link local files with absolute paths" }],
  validationChecks: [{ id: "tests", source: "issue-44", summary: "Run the relevant test suite" }],
};

describe("context manifest", () => {
  it("records provenance, precedence, exclusions, and the harness contract", () => {
    expect(createContextManifest([
      { id: "review-mode", layer: "mode", source: "session", provenance: "user-selected" },
      { id: "write-skill", layer: "skill", source: "skill", provenance: "skill.md", conflictsWith: ["review-mode"] },
      { id: "policy", layer: "policy", source: "AGENTS.md" },
    ], { activeMode: "review", contract, estimatedContextCost: 128 })).toEqual({
      activeMode: "review",
      includedSources: [
        { id: "policy", layer: "policy", source: "AGENTS.md", provenance: "AGENTS.md" },
        { id: "review-mode", layer: "mode", source: "session", provenance: "user-selected" },
      ],
      excludedSources: [{ id: "write-skill", layer: "skill", source: "skill", provenance: "skill.md", excludedBy: "review-mode", reason: "lower-precedence-conflict" }],
      precedence: ["policy", "domain", "workflow", "mode", "skill", "session", "memory"],
      precedenceDecisions: [
        { id: "policy", decision: "included" },
        { id: "review-mode", decision: "included" },
        { id: "write-skill", decision: "excluded", constrainedBy: "review-mode" },
      ],
      conflicts: [{ id: "write-skill", constrainedBy: "review-mode" }],
      estimatedContextCost: 128,
      contract,
    });
  });

  it("fails closed on same-layer conflicts", () => {
    expect(() => createContextManifest([
      { id: "strict", layer: "policy", conflictsWith: ["permissive"] },
      { id: "permissive", layer: "policy" },
    ], { activeMode: "review", contract, estimatedContextCost: 1 })).toThrow("unresolved context conflict");
  });

  it("rejects sensitive contract metadata", () => {
    expect(() => createContextManifest([], {
      activeMode: "review",
      contract: { ...contract, instructions: [{ id: "secret", source: "test", summary: ["token", "abcdefghijklmnop"].join(": ") }] },
      estimatedContextCost: 1,
    })).toThrow("contains sensitive content");
  });
});
