import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

export const CONTEXT_MODES = ["research", "implementation", "review", "triage"] as const;
export type ContextMode = (typeof CONTEXT_MODES)[number];

export interface ModeDefinition {
  mode: ContextMode;
  allowedActions: readonly string[];
  blockedActions: readonly string[];
  evidence: readonly string[];
  tools: readonly string[];
  verification: readonly string[];
  output: readonly string[];
  compatibleSkills: readonly string[];
}

export interface ModeTransition {
  from?: ContextMode;
  to: ContextMode;
  source: "manual";
}

export interface SessionModeState {
  activeMode: ContextMode;
  transitions: readonly ModeTransition[];
}

const commonVerification = ["run relevant checks", "record evidence"] as const;
const definitions: Record<ContextMode, ModeDefinition> = {
  research: {
    mode: "research",
    allowedActions: ["inspect", "search", "summarize"],
    blockedActions: ["mutate durable state", "merge changes"],
    evidence: ["sources", "observations"],
    tools: ["read-only repository and issue-tracker tools"],
    verification: commonVerification,
    output: ["findings", "open questions", "evidence links"],
    compatibleSkills: ["research", "caveman-explore"],
  },
  implementation: {
    mode: "implementation",
    allowedActions: ["edit code", "run checks", "prepare change request"],
    blockedActions: ["bypass review", "weaken safety checks"],
    evidence: ["issue acceptance criteria", "tests", "diff"],
    tools: ["repository and issue-tracker tools"],
    verification: ["tests", "typecheck", "build", "review"],
    output: ["implementation", "verification results", "change request"],
    compatibleSkills: ["implement", "ponytail", "tdd"],
  },
  review: {
    mode: "review",
    allowedActions: ["inspect diff", "run checks", "report findings"],
    blockedActions: ["modify reviewed changes", "merge without approval"],
    evidence: ["standards", "specification", "diff", "verification"],
    tools: ["repository and issue-tracker tools"],
    verification: ["two-axis code review"],
    output: ["findings", "readiness decision"],
    compatibleSkills: ["code-review", "verify-and-stop"],
  },
  triage: {
    mode: "triage",
    allowedActions: ["inspect issues", "classify scope", "define acceptance criteria"],
    blockedActions: ["implement unaccepted work", "merge changes"],
    evidence: ["issue body", "dependencies", "repository state"],
    tools: ["read-only issue-tracker and repository tools"],
    verification: ["triage checks", "dependency review"],
    output: ["scope", "priority", "acceptance criteria", "next action"],
    compatibleSkills: ["triage", "research"],
  },
};

export function getModeDefinition(mode: ContextMode): ModeDefinition {
  return definitions[mode];
}

export function isContextMode(value: string): value is ContextMode {
  return CONTEXT_MODES.includes(value as ContextMode);
}

export function selectMode(mode: ContextMode): SessionModeState {
  return { activeMode: mode, transitions: [{ to: mode, source: "manual" }] };
}

export function transitionMode(state: SessionModeState, mode: ContextMode): SessionModeState {
  if (state.activeMode === mode) return state;
  return {
    activeMode: mode,
    transitions: [...state.transitions, { from: state.activeMode, to: mode, source: "manual" }],
  };
}

export function assertSkillCompatible(mode: ContextMode, skill: string): void {
  if (!getModeDefinition(mode).compatibleSkills.includes(skill)) {
    throw new Error(`skill ${skill} is incompatible with active mode ${mode}`);
  }
}

export function modeStatePath(harnessRoot: string, sessionId: string): string {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/i.test(sessionId)) throw new Error("session ID must be a non-empty slug");
  return join(harnessRoot, "docs", ".scratch", "setup", sessionId, "mode.json");
}

export async function loadSessionModeState(harnessRoot: string, sessionId: string): Promise<SessionModeState | undefined> {
  try {
    const state = JSON.parse(await readFile(modeStatePath(harnessRoot, sessionId), "utf8")) as SessionModeState;
    if (!isContextMode(state.activeMode) || !Array.isArray(state.transitions)) throw new Error("invalid session mode state");
    return state;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

export async function saveSessionModeState(harnessRoot: string, sessionId: string, state: SessionModeState): Promise<void> {
  await mkdir(join(harnessRoot, "docs", ".scratch", "setup", sessionId), { recursive: true });
  await writeFile(modeStatePath(harnessRoot, sessionId), JSON.stringify(state) + "\n", "utf8");
}
