import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parse } from "yaml";
import { parseToolMappings, type SessionContext, type ToolMapping } from "./tool-context.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertKnownFields(value: unknown, allowed: Set<string>, label: string): asserts value is Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`${label} must be a mapping`);
  for (const field of Object.keys(value)) {
    if (!allowed.has(field)) throw new Error(`${label}.${field} is not supported`);
  }
}

export function sessionToolMappingsPath(harnessRoot: string, sessionId: string): string {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/i.test(sessionId)) throw new Error("session ID must be a non-empty slug");
  return join(harnessRoot, "docs", ".scratch", "setup", sessionId, "tool-mappings.json");
}

export async function loadSessionToolMappings(harnessRoot: string, sessionId: string): Promise<Record<string, ToolMapping>> {
  const filePath = sessionToolMappingsPath(harnessRoot, sessionId);
  let content: string;
  try {
    content = await readFile(filePath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw error;
  }
  const raw = parse(content) as unknown;
  if (!isRecord(raw)) throw new Error("session tool metadata must be a mapping");
  assertKnownFields(raw, new Set(["tool_mappings"]), "session tool metadata");
  return parseToolMappings(raw.tool_mappings, "session.tool_mappings");
}

export async function loadSessionContext(harnessRoot: string, sessionId: string): Promise<SessionContext> {
  return { sessionId, toolMappings: await loadSessionToolMappings(harnessRoot, sessionId) };
}
