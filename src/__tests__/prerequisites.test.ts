import { describe, expect, it } from "vitest";
import { harnessPrerequisites, prerequisitesForProvider } from "../prerequisites.js";

describe("harness prerequisites", () => {
  it("does not require Bitwarden for routine harness workflows", () => {
    expect(harnessPrerequisites.map(({ command }) => command)).not.toContain("bw");
    expect(prerequisitesForProvider("gemini").map(({ command }) => command)).not.toContain("bw");
  });
});
