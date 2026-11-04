import { execFile } from "node:child_process";
import { access, readFile, readdir } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface ClaudePlugin {
  id: string;
  marketplaceRepository?: string;
}

interface ClaudeSettings {
  enabledPlugins?: Record<string, unknown>;
  extraKnownMarketplaces?: Record<string, { source?: { source?: string; repo?: string } }>;
}

export function requiredClaudePlugins(settings: ClaudeSettings): ClaudePlugin[] {
  return Object.entries(settings.enabledPlugins ?? {}).filter(([, enabled]) => enabled === true).map(([id]) => {
    const marketplace = id.split("@")[1];
    if (!id.split("@")[0] || !marketplace) throw new Error(`enabled Claude plugin must be named plugin@marketplace: ${id}`);
    const source = settings.extraKnownMarketplaces?.[marketplace]?.source;
    return source?.source === "github" && source.repo ? { id, marketplaceRepository: source.repo } : { id };
  });
}

interface InstalledClaudePlugin {
  id: string;
  installPath?: unknown;
  scope?: unknown;
  projectPath?: unknown;
}

function installedClaudePlugins(listJson: string): InstalledClaudePlugin[] {
  const parsed = JSON.parse(listJson) as unknown;
  const items = Array.isArray(parsed) ? parsed : (parsed as { installed?: unknown[] } | null)?.installed ?? [];
  return items.flatMap((item) => {
    const { pluginId, id, enabled, installPath, scope, projectPath } = (item ?? {}) as { pluginId?: unknown; id?: unknown; enabled?: unknown } & Omit<InstalledClaudePlugin, "id">;
    const value = pluginId ?? id;
    return typeof value === "string" && enabled !== false ? [{ id: value.toLowerCase(), installPath, scope, projectPath }] : [];
  });
}

export function installedClaudePluginIds(listJson: string): Set<string> {
  return new Set(installedClaudePlugins(listJson).map(({ id }) => id));
}

async function hasSkill(directory: string): Promise<boolean> {
  return access(join(directory, "SKILL.md")).then(() => true, () => false);
}

async function skillNamesIn(directory: string): Promise<string[]> {
  if (await hasSkill(directory)) return [basename(directory)];
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
  return (await Promise.all(entries.filter((entry) => entry.isDirectory())
    .map(async (entry) => await hasSkill(join(directory, entry.name)) ? [entry.name] : []))).flat();
}

// Plugin skills come from skills/ plus any manifest "skills" paths, each a skill or a directory of skills.
export async function claudePluginSkills(installPath: string): Promise<string[]> {
  const manifest = JSON.parse(await readFile(join(installPath, ".claude-plugin", "plugin.json"), "utf8").catch(() => "{}")) as { skills?: unknown };
  const paths = [manifest.skills].flat().filter((path): path is string => typeof path === "string");
  const names = await Promise.all(["skills", ...paths].map((path) => skillNamesIn(join(installPath, path))));
  return [...new Set(names.flat())].sort();
}

async function claudePluginList(): Promise<string> {
  try {
    return (await execFileAsync("claude", ["plugin", "list", "--json"], { maxBuffer: 8 * 1024 * 1024 })).stdout;
  } catch {
    throw new Error("Claude plugin inventory unavailable; check that claude plugin list --json runs on this host");
  }
}

// Install paths of enabled plugins that load in projectRoot: project and local installs count only for their own directory.
export function enabledClaudePluginPaths(settings: ClaudeSettings, listJson: string, projectRoot: string): string[] {
  const required = new Set(requiredClaudePlugins(settings).map(({ id }) => id.toLowerCase()));
  return installedClaudePlugins(listJson).flatMap(({ id, installPath, scope, projectPath }) =>
    required.has(id) && typeof installPath === "string"
      && ((scope !== "project" && scope !== "local") || (typeof projectPath === "string" && resolve(projectPath) === resolve(projectRoot)))
      ? [installPath] : []);
}

export async function claudePluginSkillNames(settingsPath: string): Promise<Set<string>> {
  const settings = JSON.parse(await readFile(settingsPath, "utf8")) as ClaudeSettings;
  const paths = enabledClaudePluginPaths(settings, await claudePluginList(), dirname(dirname(settingsPath)));
  return new Set((await Promise.all(paths.map(claudePluginSkills))).flat());
}

export function claudePluginInstallCommands(missing: ClaudePlugin[]): string[] {
  const marketplaces = [...new Set(missing.flatMap((plugin) => plugin.marketplaceRepository ? [plugin.marketplaceRepository] : []))];
  return [
    ...marketplaces.map((repository) => `claude plugin marketplace add ${repository}`),
    ...missing.map((plugin) => `claude plugin install ${plugin.id} --scope project`),
  ];
}

export async function verifyClaudePlugins(settingsPath: string): Promise<void> {
  const required = requiredClaudePlugins(JSON.parse(await readFile(settingsPath, "utf8")) as ClaudeSettings);
  const installed = installedClaudePluginIds(await claudePluginList());
  const missing = required.filter((plugin) => !installed.has(plugin.id.toLowerCase()));
  for (const plugin of required) console.log(`claude plugin: ${plugin.id}: ${missing.includes(plugin) ? "missing" : "installed"}`);
  if (missing.length) throw new Error(`missing Claude plugins; install with:\n${claudePluginInstallCommands(missing).join("\n")}`);
}
