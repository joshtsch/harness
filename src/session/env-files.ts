import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { parse } from "dotenv";
import type { ProjectDefinition } from "../project-config.js";
import type { CommandRunner } from "./worktree.js";

export interface EnvFileOutcome {
  destination: string;
  status: "copied" | "skipped";
  reason?: string;
}

export interface EnvFileCopyOptions {
  clonePath: string;
  worktreePath: string;
  overwrite?: boolean;
  run: CommandRunner;
}

function envLine(name: string, value: string): string {
  // Single quotes keep values literal in both dotenv and the Supabase CLI's parser.
  if (/['\r\n]/.test(value)) throw new Error(`env variable ${name} has a value that cannot be copied as a single-quoted line`);
  return `${name}='${value}'\n`;
}

function errorCode(error: unknown): string | undefined {
  return (error as NodeJS.ErrnoException).code;
}

// Outcomes carry paths, statuses and variable names only; never file contents or values.
export async function copyProjectEnvFiles(project: ProjectDefinition, options: EnvFileCopyOptions): Promise<EnvFileOutcome[]> {
  const outcomes: EnvFileOutcome[] = [];
  for (const envFile of project.envFiles ?? []) {
    const { destination } = envFile;
    const ignored = await options.run("git", ["-C", options.worktreePath, "check-ignore", "-q", destination]);
    if (ignored.code === 1) throw new Error(`${project.name} env file destination ${destination} is not ignored by Git; refusing to copy it`);
    if (ignored.code !== 0) throw new Error(`${project.name} env file destination ${destination} could not be checked against Git ignore rules`);

    let source: string;
    try {
      source = await readFile(join(options.clonePath, envFile.source), "utf8");
    } catch (error) {
      if (errorCode(error) !== "ENOENT") throw new Error(`${project.name} env file source ${envFile.source} could not be read`);
      outcomes.push({ destination, status: "skipped", reason: `source ${envFile.source} missing` });
      continue;
    }

    let content = source;
    if (envFile.variables) {
      const values = parse(source);
      const missing = envFile.variables.filter((name) => values[name] === undefined);
      if (missing.length > 0) {
        outcomes.push({ destination, status: "skipped", reason: `source missing variables ${missing.join(", ")}` });
        continue;
      }
      content = envFile.variables.map((name) => envLine(name, values[name]!)).join("");
    }

    const target = join(options.worktreePath, destination);
    await mkdir(dirname(target), { recursive: true });
    if (options.overwrite) await rm(target, { force: true });
    try {
      await writeFile(target, content, { mode: 0o600, flag: "wx" });
    } catch (error) {
      if (errorCode(error) !== "EEXIST") throw new Error(`${project.name} env file destination ${destination} could not be written`);
      outcomes.push({ destination, status: "skipped", reason: "destination exists; pass --overwrite-env-files to replace it" });
      continue;
    }
    outcomes.push({ destination, status: "copied" });
  }
  return outcomes;
}

export function formatEnvFileOutcome(project: string, outcome: EnvFileOutcome): string {
  return `${project} env file ${outcome.destination}: ${outcome.status}${outcome.reason ? ` (${outcome.reason})` : ""}`;
}
