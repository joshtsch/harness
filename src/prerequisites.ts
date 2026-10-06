import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface HarnessPrerequisite {
  name: string;
  command: string;
  args: string[];
  installHint: string;
}

export interface PrerequisiteResult extends HarnessPrerequisite {
  available: boolean;
  version?: string;
}

export const harnessPrerequisites: HarnessPrerequisite[] = [
  { name: "Git", command: "git", args: ["--version"], installHint: "Install Git from https://git-scm.com/downloads." },
  { name: "Node.js", command: "node", args: ["--version"], installHint: "Install Node.js from https://nodejs.org/." },
  { name: "pnpm", command: "pnpm", args: ["--version"], installHint: "Install pnpm with Corepack or from https://pnpm.io/installation." },
  { name: "npx", command: "npx", args: ["--version"], installHint: "Install Node.js; npx is included with npm." },
  { name: "Codex CLI", command: "codex", args: ["--version"], installHint: "Install and authenticate the Codex CLI for this host." },
  { name: "age", command: "age", args: ["--version"], installHint: "Install age from https://github.com/FiloSottile/age#installation." },
  { name: "Bitwarden CLI", command: "bw", args: ["--version"], installHint: "Install the Bitwarden CLI from https://bitwarden.com/help/cli/." },
];

const geminiPrerequisite: HarnessPrerequisite = {
  name: "Gemini CLI", command: "gemini", args: ["--version"], installHint: "Install and authenticate Gemini CLI for this host.",
};

export function prerequisitesForProvider(provider: string): HarnessPrerequisite[] {
  if (provider === "codex") return harnessPrerequisites;
  if (provider === "gemini") return harnessPrerequisites.map((item) => item.command === "codex" ? geminiPrerequisite : item);
  throw new Error(`unknown agent provider ${provider}`);
}

export function parseAgentProviderArgs(args: string[], usage: string): string {
  if (args.length === 0) return "codex";
  if (args.length === 2 && args[0] === "--provider" && ["codex", "gemini"].includes(args[1]!)) return args[1]!;
  throw new Error(usage);
}

type CommandRunner = (command: string, args: string[]) => Promise<{ stdout: string }>;

const defaultRunner: CommandRunner = async (command, args) => {
  const result = await execFileAsync(command, args, { maxBuffer: 64 * 1024 });
  return { stdout: result.stdout };
};

export async function inspectPrerequisites(
  prerequisites: HarnessPrerequisite[] = harnessPrerequisites,
  run: CommandRunner = defaultRunner,
): Promise<PrerequisiteResult[]> {
  return Promise.all(prerequisites.map(async (prerequisite) => {
    try {
      const result = await run(prerequisite.command, prerequisite.args);
      return { ...prerequisite, available: true, version: result.stdout.trim() };
    } catch {
      return { ...prerequisite, available: false };
    }
  }));
}

export async function verifyPrerequisites(
  prerequisites: HarnessPrerequisite[] = harnessPrerequisites,
  run: CommandRunner = defaultRunner,
): Promise<void> {
  const results = await inspectPrerequisites(prerequisites, run);
  for (const result of results) {
    if (result.available) console.log(`prerequisite: ${result.name}: ${result.version ?? "available"}`);
    else console.error(`prerequisite: ${result.name}: missing. ${result.installHint}`);
  }
  const missing = results.filter((result) => !result.available);
  if (missing.length > 0) throw new Error(`missing harness prerequisites: ${missing.map((result) => result.name).join(", ")}`);
}
