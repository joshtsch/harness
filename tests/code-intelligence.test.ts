import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { exploreProject, type CommandResult } from "../src/code-intelligence.js";

const temporaryRoots: string[] = [];
afterEach(async () => { await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

async function project(withIndex = false): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "harness-code-intelligence-"));
  temporaryRoots.push(root);
  if (withIndex) await mkdir(join(root, ".codegraph"));
  return root;
}

function runner(results: CommandResult[]) {
  const calls: Array<{ command: string; args: string[]; cwd: string }> = [];
  return { calls, run: async (command: string, args: string[], options: { cwd: string; timeoutMs: number }) => {
    calls.push({ command, args, cwd: options.cwd });
    return results.shift() ?? { code: 0, stdout: "", stderr: "" };
  } };
}

describe("exploreProject", () => {
  it("uses CodeGraph only for an initialized project-local index", async () => {
    const root = await project(true);
    const commands = runner([{ code: 0, stdout: "graph result", stderr: "" }]);
    const result = await exploreProject({ projectRoot: root, query: "session finalization", run: commands.run });
    expect(result.provider).toBe("codegraph");
    expect(result.output).toBe("graph result");
    expect(commands.calls).toEqual([{ command: "codegraph", args: ["explore", "session finalization"], cwd: root }]);
  });

  it("falls back when CodeGraph is absent and keeps search scoped to the project root", async () => {
    const root = await project();
    const commands = runner([{ code: 1, stdout: "", stderr: "not found" }, { code: 0, stdout: "text result", stderr: "" }]);
    const warnings: string[] = [];
    const result = await exploreProject({ projectRoot: root, query: "session finalization", run: commands.run, warn: (message) => warnings.push(message) });
    expect(result.provider).toBe("text-search");
    expect(result.fallbackReason).toBe("command-unavailable");
    expect(warnings).toEqual(["CodeGraph is unavailable; using text search fallback."]);
    expect(commands.calls).toEqual([
      { command: "codegraph", args: ["--version"], cwd: root },
      { command: "rg", args: ["--line-number", "--hidden", "--glob", "!.git", "--glob", "!.codegraph", "session finalization", "."], cwd: root },
    ]);
  });

  it("fails over on a timed-out indexed query", async () => {
    const root = await project(true);
    const commands = runner([{ code: 124, stdout: "", stderr: "timeout" }, { code: 0, stdout: "fallback", stderr: "" }]);
    const result = await exploreProject({ projectRoot: root, query: "worktree", run: commands.run });
    expect(result.provider).toBe("text-search");
    expect(result.fallbackReason).toBe("timeout");
    expect(result.output).toBe("fallback");
  });
});
