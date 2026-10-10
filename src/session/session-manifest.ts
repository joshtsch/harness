import type { SessionContext } from "../context/index.js";
import type { ContextManifest } from "../context/index.js";

export interface SessionManifestOptions {
  issueKey: string;
  purpose: string;
  goal: string;
  issue: Record<string, unknown>;
  projects: Record<string, unknown>;
  status: string;
  contextManifest?: ContextManifest;
  failure?: Record<string, unknown>;
}

export function createSessionManifest(context: SessionContext, options: SessionManifestOptions): Record<string, unknown> {
  return {
    ...options,
    sessionId: context.sessionId,
    issue: options.issue,
    events: "session.events.jsonl",
    agentInstructions: "AGENTS.md",
    toolMappings: Object.keys(context.toolMappings),
    ...(options.contextManifest ? { contextManifest: options.contextManifest } : {}),
  };
}

export function renderSessionInstructions(options: Pick<SessionManifestOptions, "issueKey" | "purpose" | "goal">): string {
  return `# Session context\n\nRead the harness and participating repositories' AGENTS.md instructions before working. This file records session intent; it does not replace their policies.\n\nIssue: ${options.issueKey}\nPurpose: ${options.purpose}\nGoal: ${options.goal}\n\nProject refresh outcomes and worktree paths are recorded in session.json beside this file.\n`;
}
