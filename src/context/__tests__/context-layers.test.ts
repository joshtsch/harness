import { describe, expect, it } from "vitest";
import { resolveContext, type ContextEntry } from "../index.js";

describe("context layer resolution", () => {
  it("returns non-conflicting entries in precedence order", () => {
    expect(resolveContext([
      { id: "memory", layer: "memory" },
      { id: "policy", layer: "policy" },
      { id: "mode", layer: "mode" },
    ]).included.map((entry) => entry.id)).toEqual(["policy", "mode", "memory"]);
  });

  it("excludes conflicting memory", () => {
    const entries: ContextEntry[] = [
      { id: "memory-preference", layer: "memory", conflictsWith: ["safety-policy"] },
      { id: "safety-policy", layer: "policy" },
    ];

    expect(resolveContext(entries)).toEqual({
      included: [{ id: "safety-policy", layer: "policy" }],
      excluded: [{ id: "memory-preference", excludedBy: "safety-policy", reason: "lower-precedence-conflict" }],
    });
  });

  it("lets mode constrain a conflicting skill", () => {
    expect(resolveContext([
      { id: "review-mode", layer: "mode", conflictsWith: ["write-skill"] },
      { id: "write-skill", layer: "skill" },
    ])).toEqual({
      included: [{ id: "review-mode", layer: "mode", conflictsWith: ["write-skill"] }],
      excluded: [{ id: "write-skill", excludedBy: "review-mode", reason: "lower-precedence-conflict" }],
    });
  });

  it("fails closed for incompatible entries in one layer", () => {
    expect(() => resolveContext([
      { id: "strict-policy", layer: "policy", conflictsWith: ["permissive-policy"] },
      { id: "permissive-policy", layer: "policy" },
    ])).toThrow("unresolved context conflict: strict-policy and permissive-policy");
  });

  it("rejects duplicate context entry identities", () => {
    expect(() => resolveContext([
      { id: "same", layer: "domain" },
      { id: "same", layer: "memory" },
    ])).toThrow("duplicate context entry: same");
  });
});
