import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
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

export function installedClaudePluginIds(listJson: string): Set<string> {
  const parsed = JSON.parse(listJson) as unknown;
  const items = Array.isArray(parsed) ? parsed : (parsed as { installed?: unknown[] } | null)?.installed ?? [];
  return new Set(items.flatMap((item) => {
    const { pluginId, id } = (item ?? {}) as { pluginId?: unknown; id?: unknown };
    const value = pluginId ?? id;
    return typeof value === "string" ? [value.toLowerCase()] : [];
  }));
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
  let output: string;
  try {
    output = (await execFileAsync("claude", ["plugin", "list", "--json"], { maxBuffer: 8 * 1024 * 1024 })).stdout;
  } catch {
    throw new Error("Claude plugin inventory unavailable; check that claude plugin list --json runs on this host");
  }
  const installed = installedClaudePluginIds(output);
  const missing = required.filter((plugin) => !installed.has(plugin.id.toLowerCase()));
  for (const plugin of required) console.log(`claude plugin: ${plugin.id}: ${missing.includes(plugin) ? "missing" : "installed"}`);
  if (missing.length) throw new Error(`missing Claude plugins; install with:\n${claudePluginInstallCommands(missing).join("\n")}`);
}
