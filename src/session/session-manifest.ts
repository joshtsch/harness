import type { SessionContext } from "../context/index.js";
import type { ContextManifest } from "../context/index.js";

export interface SessionManifestOptions {
  issueKey: string;
  purpose: string;
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
    toolMappings: Object.keys(context.toolMappings),
    ...(options.contextManifest ? { contextManifest: options.contextManifest } : {}),
  };
}
