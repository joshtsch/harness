#!/usr/bin/env tsx
import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import { resolve } from "node:path";
import { loadProjectsConfig, loadSessionContext, type SessionContext } from "../src/project-config.js";
import { resolveIssue, type ResolvedIssue } from "../src/issue-tracker.js";
import { parseSessionArgs, resolveWorktreeRoot } from "../src/session/index.js";
import { prepareSession, type PreparationFailure, type PreparationProjectState, createSessionManifest, renderSessionInstructions, type SetupCommandRunner } from "../src/session/index.js";
import { createSessionFinalizer, runSessionFinalizationHook, type SessionFinalizationStatus } from "../src/session/index.js";
import { createSessionOptimizationHook } from "../src/optimization/index.js";
import { recordSetupEvent } from "../src/session/project-setup.js";
import { prerequisitesForProvider, verifyPrerequisites } from "../src/prerequisites.js";

const executeFile = promisify(execFile);
const args = process.argv.slice(2);
const input = parseSessionArgs(args);
const harnessRoot = resolve(".");
const worktreesDirectory = await resolveWorktreeRoot(harnessRoot);
await verifyPrerequisites(prerequisitesForProvider(process.env.HARNESS_AGENT_PROVIDER ?? "codex"));
const { projectList } = input;
const projects = await loadProjectsConfig(resolve("projects.yml"));
const selected = projectList.split(",").map((name) => projects[name]);
if (selected.some((project) => !project)) throw new Error("Unknown project in session");
const tracker = selected[0]!.issueTracker;
if (selected.some((project) => project!.issueTracker.type !== tracker.type || project!.issueTracker.repository !== tracker.repository)) {
  throw new Error("selected projects must share one issue tracker");
}

const run: SetupCommandRunner = async (command, commandArgs, options) => executeFile(command, commandArgs, options)
  .then(({ stdout, stderr }) => ({ code: 0, stdout, stderr }))
  .catch((error: any) => ({ code: typeof error.code === "number" ? error.code : 1, stdout: error.stdout ?? "", stderr: error.stderr ?? String(error) }));

const issue: ResolvedIssue = await resolveIssue(tracker, input.issueKey, (command, commandArgs) => run(command, commandArgs, { cwd: harnessRoot, env: process.env }));
const issueKey = issue.key;
const title = issue.title.replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, "[redacted-email]").replace(/\+?\d[\d\s().-]{7,}\d/g, "[redacted-phone]").slice(0, 120);
const slug = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "session";
const sessionId = `${slug(issueKey)}-${slug(title)}`.slice(0, 96).replace(/-+$/g, "");
const sessionDirectory = resolve("docs/.scratch/setup", sessionId);
await mkdir(sessionDirectory, { recursive: true });
await writeFile(resolve(sessionDirectory, "AGENTS.md"), renderSessionInstructions({ issueKey, purpose: title, goal: input.goal }), "utf8");
const session: SessionContext = await loadSessionContext(harnessRoot, sessionId);
const writeManifest = async (status: string, states: Record<string, PreparationProjectState>, failure?: PreparationFailure) => {
  await writeFile(resolve(sessionDirectory, "session.json"), JSON.stringify(createSessionManifest(session, {
    issueKey,
    purpose: title,
    goal: input.goal,
    issue: { key: issue.key, number: issue.number, repository: issue.repository },
    projects: states,
    status,
    ...(failure ? { failure: { ...failure, error: String(failure.error) } } : {}),
  })) + "\n", "utf8");
};

await writeManifest("running", Object.fromEntries(selected.map((project) => [project!.name, { status: "pending" }])));

const traceId = `trace-${sessionId}`;
const finalize = createSessionFinalizer();
const optimizationHook = createSessionOptimizationHook({
  harnessRoot,
  enabled: process.env.HARNESS_OPTIMIZATION_ENABLED !== "0",
  onDiagnostic: async (diagnostic) => recordSetupEvent(
    { logDirectory: resolve("docs/.scratch/setup"), sessionId },
    { type: "optimization-hook-failed", ...diagnostic },
  ),
  onRuleSuggestion: async (suggestion) => {
    console.warn(`Rule suggestion: ${suggestion.issueTitle}`);
    await recordSetupEvent(
      { logDirectory: resolve("docs/.scratch/setup"), sessionId },
      { type: "rule-suggestion", suggestion: { id: suggestion.id, source: suggestion.source, issueTitle: suggestion.issueTitle, rule: suggestion.rule } },
    );
  },
});
const finalizeSession = async (status: SessionFinalizationStatus): Promise<void> => {
  try {
    const result = await runSessionFinalizationHook(optimizationHook, finalize({
      sessionId,
      traceId,
      projectKey: selected[0]!.name,
      status,
      prompt: { id: issueKey, provenance: `${traceId}:prompt` },
      resolvedContext: { id: sessionId, provenance: `${traceId}:context`, summary: "session setup" },
      events: [{ sessionId, projectKey: selected[0]!.name, mode: "session-setup", skill: "setup:session", event: "finalized", durationMs: 0, result: status === "success" ? "success" : "failure" }],
      artifacts: [],
      feedback: [],
      observedState: [],
    }));
    if (!result.ok) await recordSetupEvent(
      { logDirectory: resolve("docs/.scratch/setup"), sessionId },
      { type: "optimization-hook-failed", sessionId, traceId, error: result.error },
    );
  } catch (error) {
    await recordSetupEvent(
      { logDirectory: resolve("docs/.scratch/setup"), sessionId },
      { type: "optimization-finalization-failed", sessionId, traceId, error: String(error) },
    );
  }
};

let result;
try {
  result = await prepareSession({
    selected: selected as NonNullable<(typeof selected)[number]>[],
    projectsDirectory: resolve("projects"),
    worktreesDirectory,
    issueKey,
    purpose: title,
    harnessRoot,
    session,
    logDirectory: resolve("docs/.scratch/setup"),
    onProjectRefresh: (project, result) => console.log(`${project}: ${result.status}${result.reason ? ` (${result.reason})` : ""}`),
    run,
    writeManifest,
  });
} catch (error) {
  await finalizeSession("failed");
  throw error;
}

await finalizeSession("success");

for (const worktree of result.worktrees) console.log(`${worktree.action}: ${worktree.path}`);
console.log(`Session instructions: ${resolve(sessionDirectory, "AGENTS.md")}`);
