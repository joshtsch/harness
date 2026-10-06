import { describe, expect, it, vi } from "vitest";
import { harnessPrerequisites, inspectPrerequisites, parseAgentProviderArgs, prerequisitesForProvider, type HarnessPrerequisite, verifyPrerequisites } from "../src/prerequisites.js";

const prerequisites: HarnessPrerequisite[] = [
  { name: "Git", command: "git", args: ["--version"], installHint: "install git" },
  { name: "age", command: "age", args: ["--version"], installHint: "install age" },
];

describe("harness prerequisites", () => {
  it("includes the Bitwarden CLI without requiring account access", () => {
    expect(harnessPrerequisites).toContainEqual({
      name: "Bitwarden CLI",
      command: "bw",
      args: ["--version"],
      installHint: "Install the Bitwarden CLI from https://bitwarden.com/help/cli/.",
    });
  });

  it("checks only the selected agent provider", () => {
    expect(prerequisitesForProvider("gemini").some((item) => item.command === "gemini")).toBe(true);
    expect(prerequisitesForProvider("gemini").some((item) => item.command === "codex")).toBe(false);
    expect(() => prerequisitesForProvider("unknown")).toThrow("unknown agent provider");
    expect(parseAgentProviderArgs(["--provider", "gemini"], "usage")).toBe("gemini");
    expect(() => parseAgentProviderArgs(["--provider"], "usage")).toThrow("usage");
  });

  it("reports available and missing commands", async () => {
    const results = await inspectPrerequisites(prerequisites, async (command) => {
      if (command === "git") return { stdout: "git version 2.0" };
      throw new Error("missing");
    });
    expect(results).toEqual([
      { ...prerequisites[0], available: true, version: "git version 2.0" },
      { ...prerequisites[1], available: false },
    ]);
  });

  it("fails with missing prerequisite names", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(verifyPrerequisites(prerequisites, async () => { throw new Error("missing"); })).rejects.toThrow("missing harness prerequisites: Git, age");
    error.mockRestore();
  });
});
