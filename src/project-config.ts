import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, join } from "node:path";
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

export interface ProjectQualityChecks {
  lint: WorkflowCommand;
  format: WorkflowCommand;
}

export interface ProjectEnvFile {
  source: string;
  destination: string;
  variables?: string[];
}

export interface ProjectStart {
  install?: WorkflowCommand;
  default: string;
  modes: Record<string, WorkflowCommand>;
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
  purpose?: string;
  topics?: string[];
  excludes?: string[];
  hcpWorkspace?: string;
  hcpOrganization?: string;
  defaultBranch: string;
  setupScript: string;
  issueTracker: IssueTracker;
  crm?: Crm;
  wiki?: ProjectWiki;
  businessLines?: string[];
  toolMappings?: Record<string, ToolMapping>;
  quality?: ProjectQualityChecks;
  envFiles?: ProjectEnvFile[];
  start?: ProjectStart;
  verification: WorkflowCommand[];
  workflows: WorkflowCommand[];
}

export const providerAccountCategories = ["ai", "analytics", "auth", "backups", "cdn", "ci", "crm", "database", "dns", "email", "hosting", "infrastructure", "monitoring", "object-storage", "payments", "productivity", "queues", "search", "secrets"] as const;
export type ProviderAccountCategory = (typeof providerAccountCategories)[number];

export function isProviderAccountCategory(value: string): value is ProviderAccountCategory {
  return (providerAccountCategories as readonly string[]).includes(value);
}

export interface ProviderAccount {
  name: string;
  plan: "paid" | "free";
  categories: ProviderAccountCategory[];
  /** Absent means the account is held personally. */
  businessLine?: string;
  notes?: string;
}

export function requireProjectQuality(project: ProjectDefinition): ProjectQualityChecks {
  if (!project.quality) {
    throw new Error(`project ${project.name} must configure required lint and format checks before session setup; see docs/agents/repository-intake.md#quality-and-formatting`);
  }
  return project.quality;
}

interface RawProject {
  remote?: unknown;
  purpose?: unknown;
  topics?: unknown;
  excludes?: unknown;
  hcp_workspace?: unknown;
  hcp_organization?: unknown;
  default_branch?: unknown;
  setup_script?: unknown;
  issue_tracker?: unknown;
  crm?: unknown;
  wiki?: unknown;
  business_lines?: unknown;
  tool_mappings?: unknown;
  quality?: unknown;
  env_files?: unknown;
  start?: unknown;
  verification?: unknown;
  workflows?: unknown;
}

interface RawConfig {
  defaults?: RawProject;
  business_lines?: Record<string, unknown>;
  provider_accounts?: unknown;
  projects?: Record<string, RawProject>;
}

export interface LoadProjectsConfigOptions {
  resolveEnvironment?: boolean;
  localConfigPath?: string | null;
  environment?: Record<string, string | undefined>;
}

const rawProjectFields = new Set(["purpose", "topics", "excludes", "remote", "hcp_workspace", "hcp_organization", "default_branch", "setup_script", "issue_tracker", "crm", "wiki", "business_lines", "tool_mappings", "quality", "env_files", "start", "verification", "workflows"]);
const defaultFields = new Set(["default_branch", "setup_script", "issue_tracker", "crm", "quality", "verification", "workflows"]);
const businessLineFields = new Set(["display_name", "tool_mappings"]);
const providerAccountFields = new Set(["plan", "categories", "business_line", "notes"]);
const issueTrackerFields = new Set(["type", "repository"]);
const crmFields = new Set(["type"]);
const wikiFields = new Set(["description", "topics", "pages", "raw", "templates"]);
const workflowCommandFields = new Set(["command", "args", "required"]);
const qualityFields = new Set(["lint", "format"]);
const envFileFields = new Set(["source", "destination", "variables"]);
const startFields = new Set(["install", "default", "modes"]);

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

function parseStringList(value: unknown, label: string): string[] {
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

function parseQuality(value: unknown, label: string): ProjectQualityChecks | undefined {
  if (value === undefined) return undefined;
  assertKnownFields(value, qualityFields, label);
  const parseCheck = (name: "lint" | "format"): WorkflowCommand => {
    if (value[name] === undefined) throw new Error(`${label}.${name} is required`);
    const command = parseCommands([value[name]], `${label}.${name}`, true)[0];
    if (!command) throw new Error(`${label}.${name} is required`);
    if (!command.required) throw new Error(`${label}.${name}.required must be true`);
    return command;
  };
  return { lint: parseCheck("lint"), format: parseCheck("format") };
}

function relativePath(value: unknown, label: string): string {
  const path = requiredString(value, label);
  if (isAbsolute(path) || path.split(/[\\/]/).includes("..")) throw new Error(`${label} must be a relative path inside its checkout`);
  return path;
}

function parseEnvFiles(value: unknown, label: string): ProjectEnvFile[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be a list`);
  const envFiles = value.map((entry, index): ProjectEnvFile => {
    assertKnownFields(entry, envFileFields, `${label}[${index}]`);
    const variables = entry.variables === undefined ? undefined : parseStringList(entry.variables, `${label}[${index}].variables`);
    if (variables?.length === 0) throw new Error(`${label}[${index}].variables must not be empty`);
    if (variables?.some((name) => !/^[A-Za-z_][A-Za-z0-9_]*$/.test(name))) throw new Error(`${label}[${index}].variables must be environment variable names`);
    return {
      source: relativePath(entry.source, `${label}[${index}].source`),
      destination: relativePath(entry.destination, `${label}[${index}].destination`),
      ...(variables ? { variables } : {}),
    };
  });
  if (new Set(envFiles.map(({ destination }) => destination)).size !== envFiles.length) throw new Error(`${label} must not repeat a destination`);
  return envFiles;
}

function parseStart(value: unknown, label: string): ProjectStart {
  assertKnownFields(value, startFields, label);
  const command = (entry: unknown, entryLabel: string) => parseCommands([entry], entryLabel, true)[0]!;
  if (!isRecord(value.modes) || Object.keys(value.modes).length === 0) throw new Error(`${label}.modes must be a non-empty mapping`);
  const modes = Object.fromEntries(Object.entries(value.modes).map(([mode, entry]) => {
    // Modes become `--<mode>` flags of pnpm start.
    if (!/^[a-z][a-z0-9-]*$/.test(mode)) throw new Error(`${label}.modes.${mode} must be a lowercase name`);
    return [mode, command(entry, `${label}.modes.${mode}`)];
  }));
  const defaultMode = requiredString(value.default, `${label}.default`);
  if (!modes[defaultMode]) throw new Error(`${label}.default references unknown mode ${defaultMode}`);
  return {
    ...(value.install === undefined ? {} : { install: command(value.install, `${label}.install`) }),
    default: defaultMode,
    modes,
  };
}

function parseProviderAccounts(value: unknown, businessLines: Record<string, BusinessLine>): ProviderAccount[] {
  if (value === undefined) return [];
  if (!isRecord(value)) throw new Error("provider_accounts must be a mapping");
  return Object.entries(value).map(([name, entry]): ProviderAccount => {
    const label = `provider_accounts.${name}`;
    if (name.trim() === "") throw new Error("provider account names must be non-empty");
    assertKnownFields(entry, providerAccountFields, label);
    if (entry.plan !== "paid" && entry.plan !== "free") throw new Error(`${label}.plan must be paid or free`);
    const categories = parseStringList(entry.categories, `${label}.categories`);
    if (categories.length === 0) throw new Error(`${label}.categories must not be empty`);
    const unknown = categories.find((category) => !isProviderAccountCategory(category));
    if (unknown !== undefined) throw new Error(`${label}.categories contains unknown category ${unknown}`);
    const businessLine = entry.business_line === undefined ? undefined : requiredString(entry.business_line, `${label}.business_line`);
    if (businessLine !== undefined && !businessLines[businessLine]) throw new Error(`${label}.business_line references unknown business line ${businessLine}`);
    return {
      name,
      plan: entry.plan,
      categories: categories.filter(isProviderAccountCategory),
      ...(businessLine === undefined ? {} : { businessLine }),
      ...(entry.notes === undefined ? {} : { notes: requiredString(entry.notes, `${label}.notes`) }),
    };
  });
}

/** Accounts a project may draw on: its business lines' accounts plus personal ones. */
export function providerAccountsForProject(accounts: ProviderAccount[], project: ProjectDefinition): ProviderAccount[] {
  return accounts.filter(({ businessLine }) => businessLine === undefined || (project.businessLines ?? []).includes(businessLine));
}

/** Accounts for `pnpm accounts`: optionally scoped to a project and filtered by category. */
export function selectProviderAccounts(config: HarnessConfig, filter: { project?: string; category?: ProviderAccountCategory }): ProviderAccount[] {
  let accounts = config.providerAccounts;
  if (filter.project !== undefined) {
    const project = config.projects[filter.project];
    if (!project) throw new Error("Unknown project; run pnpm projects to list configured names.");
    accounts = providerAccountsForProject(accounts, project);
  }
  const { category } = filter;
  return category === undefined ? accounts : accounts.filter(({ categories }) => categories.includes(category));
}

export async function loadProjectsConfig(filePath: string, options: LoadProjectsConfigOptions = {}): Promise<Record<string, ProjectDefinition>> {
  return (await loadHarnessConfig(filePath, options)).projects;
}

export interface HarnessConfig {
  projects: Record<string, ProjectDefinition>;
  providerAccounts: ProviderAccount[];
}

export async function loadHarnessConfig(filePath: string, options: LoadProjectsConfigOptions = {}): Promise<HarnessConfig> {
  const resolveEnvironment = options.resolveEnvironment ?? true;
  const environment = options.environment ?? process.env;
  const localConfigPath = options.localConfigPath === undefined ? defaultLocalConfigPath(filePath) : options.localConfigPath;
  const publicRaw = parse(await readFile(filePath, "utf8"));
  let rawValue = publicRaw;
  if (localConfigPath && isRecord(publicRaw) && "provider_accounts" in publicRaw) {
    throw new Error("provider_accounts is private account metadata; move it from projects.yml to projects.local.yml");
  }
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
  assertKnownFields(raw, new Set(["defaults", "business_lines", "provider_accounts", "projects"]), "configuration");
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
      toolMappings: parseToolMappings(value.tool_mappings, `business_lines.${key}.tool_mappings`, resolveEnvironment, environment),
    };
  }

  const providerAccounts = parseProviderAccounts(raw.provider_accounts, parsedBusinessLines);

  const definitions: Array<[string, ProjectDefinition]> = Object.entries(projects).map(([name, project]): [string, ProjectDefinition] => {
      if (name.trim() === "") throw new Error("project names must be non-empty");
      assertKnownFields(project, rawProjectFields, `projects.${name}`);
      const definition = project;
      return [name, {
        name,
        remote: requiredString(definition.remote, `projects.${name}.remote`),
        ...(definition.purpose === undefined ? {} : { purpose: requiredString(definition.purpose, `projects.${name}.purpose`) }),
        ...(definition.topics === undefined ? {} : { topics: parseStringList(definition.topics, `projects.${name}.topics`) }),
        ...(definition.excludes === undefined ? {} : { excludes: parseStringList(definition.excludes, `projects.${name}.excludes`) }),
        ...(definition.hcp_workspace === undefined ? {} : { hcpWorkspace: requiredString(definition.hcp_workspace, `projects.${name}.hcp_workspace`) }),
        ...(definition.hcp_organization === undefined ? {} : { hcpOrganization: requiredString(definition.hcp_organization, `projects.${name}.hcp_organization`) }),
        defaultBranch: requiredString(definition.default_branch ?? defaults.default_branch, `projects.${name}.default_branch`),
        setupScript: requiredString(definition.setup_script ?? defaults.setup_script, `projects.${name}.setup_script`),
        issueTracker: mergeIssueTracker(defaults.issue_tracker, definition.issue_tracker, name),
        crm: parseCrm(definition.crm !== undefined ? definition.crm : defaults.crm, name),
        wiki: parseWiki(definition.wiki, name),
        businessLines: parseStringList(definition.business_lines, `projects.${name}.business_lines`).map((key) => {
          if (!parsedBusinessLines[key]) throw new Error(`projects.${name}.business_lines references unknown business line ${key}`);
          return key;
        }),
        toolMappings: parseToolMappings(definition.tool_mappings, `projects.${name}.tool_mappings`, resolveEnvironment, environment),
        quality: parseQuality(definition.quality ?? defaults.quality, `projects.${name}.quality`),
        ...(definition.env_files === undefined ? {} : { envFiles: parseEnvFiles(definition.env_files, `projects.${name}.env_files`) }),
        ...(definition.start === undefined ? {} : { start: parseStart(definition.start, `projects.${name}.start`) }),
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
  return { projects: Object.fromEntries(definitions), providerAccounts };
}
