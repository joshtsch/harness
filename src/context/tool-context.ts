import type { ProjectDefinition } from "../project-config.js";

export type ToolAccess = "read" | "write" | "read_write";

export interface ToolTarget {
  id: string;
  access: ToolAccess;
  default?: boolean;
}

export interface ToolMapping {
  provider: string;
  targets: ToolTarget[];
}

export type ToolOperation = "read" | "write" | "single_record";

export interface ToolContext {
  tool: string;
  mappings: ToolMapping[];
  targets: ResolvedToolTarget[];
}

export interface ToolContextOptions {
  operation?: ToolOperation;
  provider?: string;
  targetId?: string;
  required?: boolean;
}

export interface SessionContext {
  sessionId: string;
  toolMappings: Record<string, ToolMapping>;
}

export interface ResolvedToolTarget extends ToolTarget {
  provider: string;
}

export interface BusinessLine {
  key: string;
  displayName: string;
  toolMappings: Record<string, ToolMapping>;
}

const toolMappingFields = new Set(["provider", "targets"]);
const toolTargetFields = new Set(["id", "access", "default"]);
const toolAccesses = new Set<ToolAccess>(["read", "write", "read_write"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertKnownFields(value: unknown, allowed: Set<string>, label: string): asserts value is Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`${label} must be a mapping`);
  for (const field of Object.keys(value)) {
    if (!allowed.has(field)) throw new Error(`${label}.${field} is not supported`);
  }
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim() === "") throw new Error(`${label} must be a non-empty string`);
  return value;
}

function resolveTargetId(value: unknown, label: string, resolveEnvironment: boolean): string {
  const id = requiredString(value, label);
  const reference = /^\$\{([A-Z][A-Z0-9_]*)\}$/.exec(id);
  if (!reference || !resolveEnvironment) return id;
  const resolved = process.env[reference[1]]?.trim();
  if (!resolved) throw new Error(`${label} environment variable ${reference[1]} must be set`);
  return resolved;
}

export function parseToolMappings(value: unknown, label: string, resolveEnvironment = true): Record<string, ToolMapping> {
  if (value === undefined) return {};
  if (!isRecord(value)) throw new Error(`${label} must be a mapping`);
  return Object.fromEntries(Object.entries(value).map(([tool, mapping]) => {
    if (tool.trim() === "") throw new Error(`${label} contains an empty tool name`);
    assertKnownFields(mapping, toolMappingFields, `${label}.${tool}`);
    if (!Array.isArray(mapping.targets) || mapping.targets.length === 0) {
      throw new Error(`${label}.${tool}.targets must be a non-empty list`);
    }
    const targets = mapping.targets.map((target, index) => {
      assertKnownFields(target, toolTargetFields, `${label}.${tool}.targets[${index}]`);
      const id = resolveTargetId(target.id, `${label}.${tool}.targets[${index}].id`, resolveEnvironment);
      if (!toolAccesses.has(target.access as ToolAccess)) {
        throw new Error(`${label}.${tool}.targets[${index}].access must be read, write, or read_write`);
      }
      if (target.default !== undefined && typeof target.default !== "boolean") {
        throw new Error(`${label}.${tool}.targets[${index}].default must be a boolean`);
      }
      return { id, access: target.access as ToolAccess, ...(target.default === true ? { default: true } : {}) };
    });
    const ids = new Set(targets.map((target) => target.id));
    if (ids.size !== targets.length) throw new Error(`${label}.${tool}.targets must not contain duplicate ids`);
    if (tool === "calendar") {
      const defaults = targets.filter((target) => target.default);
      if (defaults.length > 1) throw new Error(`${label}.calendar must have at most one default target`);
      if (defaults.some((target) => target.access === "read")) throw new Error(`${label}.calendar default target must be writable`);
      const writable = targets.filter((target) => target.access !== "read");
      if (writable.length > 0 && defaults.length !== 1) {
        throw new Error(`${label}.calendar must have exactly one default writable target`);
      }
    }
    return [tool, { provider: requiredString(mapping.provider, `${label}.${tool}.provider`), targets } satisfies ToolMapping];
  }));
}

function uniqueTargets(mappings: ToolMapping[]): ResolvedToolTarget[] {
  const targets = new Map<string, ResolvedToolTarget>();
  for (const mapping of mappings) {
    for (const target of mapping.targets) {
      const key = `${mapping.provider}:${target.id}`;
      const existing = targets.get(key);
      if (existing && (existing.access !== target.access || existing.default !== target.default)) {
        throw new Error(`Conflicting mappings for ${mapping.provider}:${target.id}`);
      }
      if (!existing) targets.set(key, { ...target, provider: mapping.provider });
    }
  }
  return [...targets.values()];
}

function calendarWriteDefaults(targets: ResolvedToolTarget[]): ResolvedToolTarget[] {
  return targets.filter((target) => target.access !== "read" && target.default);
}

function readableTargets(targets: ResolvedToolTarget[]): ResolvedToolTarget[] {
  return targets.filter((target) => target.access !== "write");
}

export function resolveToolContext(
  project: ProjectDefinition,
  businessLines: Record<string, BusinessLine>,
  tool: string,
  options: ToolContextOptions = {},
  session?: SessionContext,
): ToolContext {
  const operation = options.operation ?? "read";
  for (const key of project.businessLines ?? []) {
    if (!businessLines[key]) throw new Error(`Project ${project.name} references unknown business line ${key}`);
  }
  const inherited = (project.businessLines ?? [])
    .map((key) => businessLines[key]?.toolMappings[tool])
    .filter((mapping): mapping is ToolMapping => mapping !== undefined);
  const sessionMapping = session?.toolMappings[tool];
  const override = project.toolMappings?.[tool];
  const mappings = sessionMapping ? [sessionMapping] : override ? [override] : inherited;
  const context = { tool, mappings, targets: uniqueTargets(mappings) };

  if (operation === "write" && tool === "calendar") {
    if (calendarWriteDefaults(context.targets).length !== 1) {
      throw new Error("Calendar writes require exactly one default writable target or an explicit target");
    }
  }
  if (mappings.length === 0) {
    if (options.required || operation !== "read") throw new Error(`No ${tool} mapping is configured for project ${project.name}`);
    return context;
  }
  if (options.targetId !== undefined) {
    const matches = context.targets.filter((target) => target.id === options.targetId &&
      (options.provider === undefined || target.provider === options.provider));
    if (matches.length === 0) throw new Error(`Target ${options.targetId} is not configured for ${tool}`);
    if (matches.length > 1) throw new Error(`Target ${options.targetId} is ambiguous for ${tool}; specify the provider`);
    if ((operation === "read" && matches[0].access === "write") || (operation !== "read" && matches[0].access === "read")) {
      throw new Error(`Target ${options.targetId} does not allow ${operation} operations`);
    }
    if (operation === "write" && tool === "calendar" && matches[0].default !== true) {
      throw new Error("Calendar writes require a default writable target");
    }
    return { ...context, targets: matches };
  }
  if (operation === "read") {
    const readable = readableTargets(context.targets);
    if (readable.length === 0 && mappings.length > 0) throw new Error(`No readable ${tool} target is configured for project ${project.name}`);
    return { ...context, targets: readable };
  }
  const writable = context.targets.filter((target) => target.access !== "read");
  if (tool === "calendar") {
    const defaults = calendarWriteDefaults(writable);
    if (defaults.length !== 1) throw new Error("Calendar writes require exactly one default writable target or an explicit target");
    return { ...context, targets: defaults };
  }
  if (writable.length !== 1) throw new Error(`${operation} operation for ${tool} requires an explicit target`);
  return { ...context, targets: writable };
}

export function resolveSessionToolContext(
  session: SessionContext,
  project: ProjectDefinition,
  businessLines: Record<string, BusinessLine>,
  tool: string,
  options: ToolContextOptions = {},
): ToolContext {
  return resolveToolContext(project, businessLines, tool, options, session);
}
