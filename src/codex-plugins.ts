import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import { parse } from "yaml";

const execFileAsync = promisify(execFile);

export interface RequiredPlugin {
  name: string;
  marketplace: string;
  source: string;
  install: string[];
}

interface RawPlugin {
  name?: unknown;
  marketplace?: unknown;
  source?: unknown;
  install?: unknown;
}

interface RawPluginConfig {
  plugins?: unknown;
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value;
}

export async function loadRequiredPlugins(filePath: string): Promise<RequiredPlugin[]> {
  const raw = parse(await readFile(filePath, "utf8")) as RawPluginConfig | null;
  if (!Array.isArray(raw?.plugins)) throw new Error("plugins must be a list");

  return raw.plugins.map((value, index) => {
    const plugin = (value ?? {}) as RawPlugin;
    if (!Array.isArray(plugin.install) || plugin.install.some((command) => typeof command !== "string")) {
      throw new Error(`plugins[${index}].install must be a list of commands`);
    }
    return {
      name: requiredString(plugin.name, `plugins[${index}].name`),
      marketplace: requiredString(plugin.marketplace, `plugins[${index}].marketplace`),
      source: requiredString(plugin.source, `plugins[${index}].source`),
      install: plugin.install,
    };
  });
}

export function installedPluginNames(pluginListOutput: string): Set<string> {
  const names = new Set<string>();
  for (const line of pluginListOutput.split("\n")) {
    const match = line.match(/^\s*([a-z0-9][a-z0-9-]*)@([a-z0-9][a-z0-9-]*)\s+(installed(?:, enabled)?)/i);
    if (match) names.add(`${match[1]}@${match[2]}`.toLowerCase());
  }
  return names;
}

export function missingRequiredPlugins(required: RequiredPlugin[], pluginListOutput: string): RequiredPlugin[] {
  const installed = installedPluginNames(pluginListOutput);
  return required.filter((plugin) => !installed.has(`${plugin.name}@${plugin.marketplace}`.toLowerCase()));
}

export async function verifyRequiredPlugins(required: RequiredPlugin[]): Promise<void> {
  let output: string;
  try {
    const result = await execFileAsync("codex", ["plugin", "list"]);
    output = `${result.stdout}\n${result.stderr}`;
  } catch (error) {
    const details = error instanceof Error ? error.message : String(error);
    throw new Error(`Unable to inspect Codex plugins: ${details}`);
  }

  const missing = missingRequiredPlugins(required, output);
  if (missing.length === 0) return;

  const instructions = missing.flatMap((plugin) => plugin.install).join("\n  ");
  throw new Error(`Missing required Codex plugin(s): ${missing.map((plugin) => `${plugin.name}@${plugin.marketplace}`).join(", ")}\nInstall with:\n  ${instructions}`);
}
