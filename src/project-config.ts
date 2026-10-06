import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { parse } from "yaml";
import { parseToolMappings, type BusinessLine, type ToolMapping } from "./context/index.js";

export type { BusinessLine, ResolvedToolTarget, SessionContext, ToolAccess, ToolContext, ToolContextOptions, ToolMapping, ToolOperation, ToolTarget } from "./context/index.js";
export { loadSessionContext, loadSessionToolMappings, sessionToolMappingsPath } from "./context/index.js";
export { resolveSessionToolContext, resolveToolContext } from "./context/index.js";

export interface IssueTracker {
  type: string;
  repository?: string;
}

export interface Crm {
  type: string;
}

export interface WorkflowCommand {
  command: string;
  args: string[];
  required: boolean;
}

export interface ProjectWiki {
  description: string;
  topics: string[];
  pages: string;
  raw: string;
  templates: string;
}

export interface ProjectDefinition {
  name: string;
  remote: string;
  defaultBranch: string;
  setupScript: string;
  issueTracker: IssueTracker;
  crm?: Crm;
  wiki?: ProjectWiki;
  businessLines?: string[];
  toolMappings?: Record<string, ToolMapping>;
  verification: WorkflowCommand[];
  workflows: WorkflowCommand[];
}

interface RawProject {
  remote?: unknown;
  default_branch?: unknown;
  setup_script?: unknown;
  issue_tracker?: unknown;
  crm?: unknown;
  wiki?: unknown;
  business_lines?: unknown;
  tool_mappings?: unknown;
  verification?: unknown;
  workflows?: unknown;
}

interface RawConfig {
  defaults?: RawProject;
  business_lines?: Record<string, unknown>;
  projects?: Record<string, RawProject>;
}

export interface LoadProjectsConfigOptions {
  resolveEnvironment?: boolean;
  localConfigPath?: string | null;
}

const rawProjectFields = new Set(["remote", "default_branch", "setup_script", "issue_tracker", "crm", "wiki", "business_lines", "tool_mappings", "verification", "workflows"]);
const defaultFields = new Set(["default_branch", "setup_script", "issue_tracker", "crm", "verification", "workflows"]);
const businessLineFields = new Set(["display_name", "tool_mappings"]);
const issueTrackerFields = new Set(["type", "repository"]);
const crmFields = new Set(["type"]);
const wikiFields = new Set(["description", "topics", "pages", "raw", "templates"]);
const workflowCommandFields = new Set(["command", "args", "required"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function mergeConfigValues(base: unknown, local: unknown): unknown {
  if (!isRecord(base) || !isRecord(local)) return local;
  const merged: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(local)) {
    merged[key] = key in merged ? mergeConfigValues(merged[key], value) : value;
  }
  return merged;
}

function defaultLocalConfigPath(filePath: string): string | undefined {
  if (!filePath.endsWith("projects.yml")) return undefined;
  return join(dirname(filePath), "projects.local.yml");
}

function assertKnownFields(value: unknown, allowed: Set<string>, label: string): asserts value is Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`${label} must be a mapping`);
  for (const field of Object.keys(value)) {
    if (!allowed.has(field)) throw new Error(`${label}.${field} is not supported`);
  }
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value;
}

function mergeIssueTracker(defaults: unknown, project: unknown, name: string): IssueTracker {
  if (defaults !== undefined) assertKnownFields(defaults, issueTrackerFields, "defaults.issue_tracker");
  if (project !== undefined) assertKnownFields(project, issueTrackerFields, `projects.${name}.issue_tracker`);
  const merged = { ...(isRecord(defaults) ? defaults : {}), ...(isRecord(project) ? project : {}) };
  if (merged.repository !== undefined && (typeof merged.repository !== "string" || merged.repository.trim() === "")) {
    throw new Error(`projects.${name}.issue_tracker.repository must be a non-empty string`);
  }
  return {
    type: requiredString(merged.type, `projects.${name}.issue_tracker.type`),
    ...(typeof merged.repository === "string" ? { repository: merged.repository } : {}),
  };
}

function parseCrm(value: unknown, name: string): Crm | undefined {
  if (value === undefined) return undefined;
  assertKnownFields(value, crmFields, `projects.${name}.crm`);
  const type = value.type;
  return { type: requiredString(type, `projects.${name}.crm.type`) };
}

function parseWiki(value: unknown, name: string): ProjectWiki | undefined {
  if (value === undefined) return undefined;
  assertKnownFields(value, wikiFields, `projects.${name}.wiki`);
  if (!Array.isArray(value.topics) || value.topics.some((topic) => typeof topic !== "string" || topic.trim() === "")) {
    throw new Error(`projects.${name}.wiki.topics must be a list of non-empty strings`);
  }
  return {
    description: requiredString(value.description, `projects.${name}.wiki.description`),
    topics: value.topics,
    pages: requiredString(value.pages, `projects.${name}.wiki.pages`),
    raw: requiredString(value.raw, `projects.${name}.wiki.raw`),
    templates: requiredString(value.templates, `projects.${name}.wiki.templates`),
  };
}

function parseBusinessLines(value: unknown, label: string): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string" || entry.trim() === "")) {
    throw new Error(`${label} must be a list of non-empty strings`);
  }
  const result = value as string[];
  if (new Set(result).size !== result.length) throw new Error(`${label} must not contain duplicates`);
  return result;
}

function parseCommands(value: unknown, label: string, required: boolean): WorkflowCommand[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error(`${label} must be a list`);
  return value.map((entry, index) => {
    assertKnownFields(entry, workflowCommandFields, `${label}[${index}]`);
    if (!Array.isArray(entry.args) || entry.args.some((arg) => typeof arg !== "string")) {
      throw new Error(`${label}[${index}].args must be a list of strings`);
    }
    if (entry.required !== undefined && typeof entry.required !== "boolean") {
      throw new Error(`${label}[${index}].required must be a boolean`);
    }
    return {
      command: requiredString(entry.command, `${label}[${index}].command`),
      args: entry.args,
      required: entry.required ?? required,
    };
  });
}

export async function loadProjectsConfig(filePath: string, options: LoadProjectsConfigOptions = {}): Promise<Record<string, ProjectDefinition>> {
  const resolveEnvironment = options.resolveEnvironment ?? true;
  const localConfigPath = options.localConfigPath === undefined ? defaultLocalConfigPath(filePath) : options.localConfigPath;
  const publicRaw = parse(await readFile(filePath, "utf8"));
  let rawValue = publicRaw;
  if (localConfigPath) {
    try {
      const localRaw = parse(await readFile(localConfigPath, "utf8"));
      rawValue = mergeConfigValues(publicRaw, localRaw);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  const raw = rawValue as RawConfig | null;
  if (!isRecord(raw)) throw new Error("configuration must be a mapping");
  assertKnownFields(raw, new Set(["defaults", "business_lines", "projects"]), "configuration");
  const businessLines = raw.business_lines;
  if (businessLines !== undefined && !isRecord(businessLines)) throw new Error("business_lines must be a mapping");
  const defaults = raw.defaults === undefined ? {} : raw.defaults;
  assertKnownFields(defaults, defaultFields, "defaults");
  const projects = raw.projects;
  if (!isRecord(projects)) throw new Error("projects must be a mapping");

  const parsedBusinessLines: Record<string, BusinessLine> = {};
  for (const [key, value] of Object.entries(businessLines ?? {})) {
    if (key.trim() === "") throw new Error("business line keys must be non-empty");
    assertKnownFields(value, businessLineFields, `business_lines.${key}`);
    parsedBusinessLines[key] = {
      key,
      displayName: requiredString(value.display_name, `business_lines.${key}.display_name`),
      toolMappings: parseToolMappings(value.tool_mappings, `business_lines.${key}.tool_mappings`, resolveEnvironment),
    };
  }

  const definitions: Array<[string, ProjectDefinition]> = Object.entries(projects).map(([name, project]): [string, ProjectDefinition] => {
      if (name.trim() === "") throw new Error("project names must be non-empty");
      assertKnownFields(project, rawProjectFields, `projects.${name}`);
      const definition = project;
      return [name, {
        name,
        remote: requiredString(definition.remote, `projects.${name}.remote`),
        defaultBranch: requiredString(definition.default_branch ?? defaults.default_branch, `projects.${name}.default_branch`),
        setupScript: requiredString(definition.setup_script ?? defaults.setup_script, `projects.${name}.setup_script`),
        issueTracker: mergeIssueTracker(defaults.issue_tracker, definition.issue_tracker, name),
        crm: parseCrm(definition.crm !== undefined ? definition.crm : defaults.crm, name),
        wiki: parseWiki(definition.wiki, name),
        businessLines: parseBusinessLines(definition.business_lines, `projects.${name}.business_lines`).map((key) => {
          if (!parsedBusinessLines[key]) throw new Error(`projects.${name}.business_lines references unknown business line ${key}`);
          return key;
        }),
        toolMappings: parseToolMappings(definition.tool_mappings, `projects.${name}.tool_mappings`, resolveEnvironment),
        verification: parseCommands(definition.verification ?? defaults.verification, `projects.${name}.verification`, true),
        workflows: parseCommands(definition.workflows ?? defaults.workflows, `projects.${name}.workflows`, false),
      } satisfies ProjectDefinition];
  });
  const remotes = new Map<string, string>();
  for (const [name, definition] of definitions) {
    const previous = remotes.get(definition.remote);
    if (previous) throw new Error(`projects.${name}.remote duplicates projects.${previous}.remote`);
    remotes.set(definition.remote, name);
  }
  return Object.fromEntries(definitions);
}
