import { afterEach, describe, expect, it, vi } from "vitest";

const originalArgs = process.argv;
const originalExitCode = process.exitCode;
afterEach(() => {
  process.argv = originalArgs;
  process.exitCode = originalExitCode;
  vi.restoreAllMocks();
  vi.resetModules();
});

async function runInitialization(args: string[], projects: Array<{ name: string; status: string }>) {
  vi.resetModules();
  process.argv = ["node", "init.ts", ...args];
  process.exitCode = undefined;
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  const initializeProjects = vi.fn().mockResolvedValue(projects);
  vi.doMock("../src/initialization-projects.js", async (original) => ({
    ...await original<typeof import("../src/initialization-projects.js")>(), initializeProjects,
  }));
  vi.doMock("../src/prerequisites.js", async (original) => ({
    ...await original<typeof import("../src/prerequisites.js")>(), verifyPrerequisites: vi.fn(),
  }));
  vi.doMock("node:child_process", () => ({ execFile: (_command: string, _args: string[], _options: unknown, callback: (error: Error | null, stdout: string, stderr: string) => void) => callback(null, "", "") }));
  vi.doMock("../src/project-skills.js", () => ({ verifyProjectSkills: vi.fn() }));
  vi.doMock("../src/capability-policy.js", () => ({ loadCapabilityPolicy: vi.fn(), verifyCapabilityInventory: vi.fn() }));
  vi.doMock("../src/gemini-skills.js", () => ({ verifyGeminiProjectSkills: vi.fn() }));
  vi.doMock("../src/codex-plugins.js", () => ({ loadRequiredPlugins: vi.fn(), verifyRequiredPlugins: vi.fn() }));
  await import("../scripts/init.js");
  await vi.waitFor(() => expect(log.mock.calls.flat().includes("init: complete") || process.exitCode === 1).toBe(true));
  return { initializeProjects, output: log.mock.calls.flat().join("\n"), errors: error.mock.calls.flat().join("\n") };
}

describe("initialization CLI", () => {
  it("reports missing clones with the restore command during plain initialization", async () => {
    const { initializeProjects, output } = await runInitialization([], [{ name: "fixture", status: "missing" }]);
    expect(initializeProjects).toHaveBeenCalledWith(expect.any(String), false);
    expect(output).toContain("project: fixture: missing");
    expect(output).toContain("restore with pnpm init:harness --clone-projects");
    expect(output).toContain("init: complete");
  });

  it("passes cloning opt-in through Gemini initialization", async () => {
    const { initializeProjects, output } = await runInitialization(["--provider", "gemini", "--clone-projects"], [{ name: "fixture", status: "cloned" }]);
    expect(initializeProjects).toHaveBeenCalledWith(expect.any(String), true);
    expect(output).toContain("project: fixture: cloned");
    expect(output).toContain("init: complete");
  });

  it("reports every project failure and exits nonzero before dependency restoration", async () => {
    const { output, errors } = await runInitialization(["--clone-projects"], [{ name: "first", status: "failed" }, { name: "second", status: "existing" }]);
    expect(output).toContain("project: first: failed");
    expect(output).toContain("project: second: existing");
    expect(errors).toContain("1 project(s) failed");
    expect(output).not.toContain("init: project skills");
    expect(output).not.toContain("init: complete");
    expect(process.exitCode).toBe(1);
  });
});
