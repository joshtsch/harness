import { access, stat } from "node:fs/promises";
import { constants } from "node:fs";
import { isAbsolute } from "node:path";

export type CodeIntelligenceProvider = "codegraph" | "text-search";

export interface CommandResult { code: number; stdout: string; stderr: string; }

export interface CodeIntelligenceRunOptions {
  projectRoot: string;
  query: string;
  command?: string;
  timeoutMs?: number;
  run?: (command: string, args: string[], options: { cwd: string; timeoutMs: number }) => Promise<CommandResult>;
  warn?: (message: string) => void;
}

export interface CodeIntelligenceResult {
  provider: CodeIntelligenceProvider;
  query: string;
  projectRoot: string;
  output: string;
  fallbackReason?: "command-unavailable" | "index-unavailable" | "index-query-failed" | "timeout";
}

const defaultTimeoutMs = 5_000;

async function defaultRun(command: string, args: string[], options: { cwd: string; timeoutMs: number }): Promise<CommandResult> {
  const { execFile } = await import("node:child_process");
  return new Promise((resolve) => {
    execFile(command, args, { cwd: options.cwd, timeout: options.timeoutMs, maxBuffer: 256 * 1024 }, (error, stdout, stderr) => {
      const timedOut = error?.killed === true || error?.code === "ETIMEDOUT";
      resolve({ code: timedOut ? 124 : typeof error?.code === "number" ? error.code : error ? 1 : 0, stdout, stderr });
    });
  });
}

async function assertProjectRoot(projectRoot: string): Promise<void> {
  if (!isAbsolute(projectRoot)) throw new Error("projectRoot must be absolute");
  if (!(await stat(projectRoot)).isDirectory()) throw new Error("projectRoot must be a directory");
}

async function hasCodeGraphIndex(projectRoot: string): Promise<boolean> {
  try { await access(`${projectRoot}/.codegraph`, constants.R_OK); return true; } catch { return false; }
}

export async function exploreProject(options: CodeIntelligenceRunOptions): Promise<CodeIntelligenceResult> {
  await assertProjectRoot(options.projectRoot);
  if (options.query.trim() === "") throw new Error("query must be non-empty");
  const timeoutMs = options.timeoutMs ?? defaultTimeoutMs;
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) throw new Error("timeoutMs must be a positive integer");
  const run = options.run ?? defaultRun;
  const warn = options.warn ?? console.warn;
  const command = options.command ?? "codegraph";
  const base = { query: options.query, projectRoot: options.projectRoot };

  if (await hasCodeGraphIndex(options.projectRoot)) {
    const result = await run(command, ["explore", options.query], { cwd: options.projectRoot, timeoutMs });
    if (result.code === 0) return { ...base, provider: "codegraph", output: result.stdout };
    if (result.code === 124) {
      warn("CodeGraph query timed out; using text search fallback.");
      return { ...await textSearch(base, run, timeoutMs), fallbackReason: "timeout" };
    }
    warn("CodeGraph query failed; using text search fallback.");
    return { ...await textSearch(base, run, timeoutMs), fallbackReason: "index-query-failed" };
  }

  const commandProbe = await run(command, ["--version"], { cwd: options.projectRoot, timeoutMs });
  const fallbackReason = commandProbe.code === 124 ? "timeout" : commandProbe.code === 0 ? "index-unavailable" : "command-unavailable";
  warn(fallbackReason === "command-unavailable"
    ? "CodeGraph is unavailable; using text search fallback."
    : fallbackReason === "index-unavailable"
      ? "CodeGraph index is missing; using text search fallback."
      : "CodeGraph probe timed out; using text search fallback.");
  return {
    ...await textSearch(base, run, timeoutMs),
    fallbackReason,
  };
}

async function textSearch(base: Pick<CodeIntelligenceResult, "query" | "projectRoot">, run: NonNullable<CodeIntelligenceRunOptions["run"]>, timeoutMs: number): Promise<CodeIntelligenceResult> {
  const result = await run("rg", ["--line-number", "--hidden", "--glob", "!.git", "--glob", "!.codegraph", base.query, "."], { cwd: base.projectRoot, timeoutMs });
  return { ...base, provider: "text-search", output: result.stdout };
}
