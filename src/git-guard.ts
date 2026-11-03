import { posix, resolve } from "node:path";
import { findSensitiveContent } from "./sensitive-content.js";

export interface CommitInvocation {
  directory: string;
  stagesChanges: boolean;
}

export const separator = Symbol("separator");
// Precedes a redirection target when tokenizeCommand keeps redirections.
export const redirect = Symbol("redirect");
type Token = string | typeof separator | typeof redirect;

// Splits a shell command into words and command separators, honoring quotes and
// skipping heredoc bodies and (unless keepRedirects) redirections. Not a full shell parser.
export function tokenizeCommand(command: string, keepRedirects = false): Token[] {
  const tokens: Token[] = [];
  let word: string | undefined;
  let skipNext = false;
  const flush = () => {
    if (word === undefined) return;
    if (skipNext) skipNext = false;
    else tokens.push(word);
    word = undefined;
  };
  for (let index = 0; index < command.length; index++) {
    const char = command[index]!;
    if (char === "'" || char === '"') {
      const end = command.indexOf(char, index + 1);
      const stop = end === -1 ? command.length : end;
      word = (word ?? "") + command.slice(index + 1, stop);
      index = stop;
    } else if (char === "\\" && index + 1 < command.length) {
      word = (word ?? "") + command[++index];
    } else if (command.startsWith("<<", index) && command[index + 2] !== "<") {
      flush();
      const heredoc = /^<<-?\s*(['"]?)([A-Za-z0-9_]+)\1([^\n]*)\n?/.exec(command.slice(index));
      if (!heredoc) { index++; continue; }
      // The rest of the heredoc's first line, such as `> file` or `| cmd`, still belongs to the command.
      tokens.push(...tokenizeCommand(heredoc[3]!, keepRedirects));
      const bodyStart = index + heredoc[0].length;
      const lines = command.slice(bodyStart).split("\n");
      const close = lines.findIndex((line) => line.trim() === heredoc[2]);
      index = close === -1 ? command.length : bodyStart + lines.slice(0, close + 1).join("\n").length;
      tokens.push(separator);
    } else if (char === "<" || char === ">") {
      if (word !== undefined && /^\d+$/.test(word)) word = undefined;
      flush();
      while (/[<>&]/.test(command[index + 1] ?? "")) index++;
      if (/\d/.test(command[index + 1] ?? "") && command[index] === "&") index++;
      else if (keepRedirects && char === ">") tokens.push(redirect);
      else skipNext = true;
    } else if (/[;&|()\n]/.test(char)) {
      flush();
      tokens.push(separator);
    } else if (/\s/.test(char)) {
      flush();
    } else {
      word = (word ?? "") + char;
    }
  }
  flush();
  return tokens;
}

const gitValueOptions = new Set(["-C", "-c", "--git-dir", "--work-tree", "--namespace"]);
const commitValueOptions = new Set(["-m", "--message", "-F", "--file", "-C", "--reuse-message", "-c", "--reedit-message", "--author", "--date", "--fixup", "--squash", "--cleanup", "-t", "--template", "--trailer"]);
const commitStagingOptions = new Set(["-a", "--all", "-i", "--include", "-o", "--only", "--pathspec-from-file"]);

// Returns true when the commit arguments commit content outside the current index.
function commitStages(args: string[]): boolean {
  for (let index = 0; index < args.length; index++) {
    const arg = args[index]!;
    if (arg === "--") return index + 1 < args.length;
    const name = arg.split("=")[0]!;
    if (commitStagingOptions.has(name)) return true;
    if (arg.startsWith("--")) {
      if (!arg.includes("=") && commitValueOptions.has(arg)) index++;
    } else if (arg.startsWith("-") && arg.length > 1) {
      for (let position = 1; position < arg.length; position++) {
        const flag = arg[position]!;
        if ("aio".includes(flag)) return true;
        if ("mFCct".includes(flag)) {
          if (position === arg.length - 1) index++;
          break;
        }
      }
    } else {
      return true;
    }
  }
  return false;
}

// Best-effort parse of the repository a Bash command commits in. Returns
// undefined when the command runs no `git commit`.
export function parseCommitInvocation(command: string, cwd: string): CommitInvocation | undefined {
  const segments: string[][] = [[]];
  for (const token of tokenizeCommand(command)) {
    if (token === separator) segments.push([]);
    else if (typeof token === "string") segments.at(-1)!.push(token);
  }
  let directory = cwd;
  let staged = false;
  for (const segment of segments) {
    const start = segment.findIndex((word) => !/^[A-Za-z_][A-Za-z0-9_]*=/.test(word) && word !== "sudo" && word !== "command");
    if (start === -1) continue;
    const words = segment.slice(start);
    if (words[0] === "cd" && words[1]) {
      directory = resolve(directory, words[1]);
      continue;
    }
    if (words[0] !== "git") continue;
    let repository = directory;
    let index = 1;
    for (; index < words.length && words[index]!.startsWith("-"); index++) {
      const option = words[index]!;
      if (!gitValueOptions.has(option)) continue;
      if (option === "-C" && words[index + 1]) repository = resolve(repository, words[index + 1]!);
      index++;
    }
    const subcommand = words[index];
    if (subcommand === "add" || subcommand === "rm" || subcommand === "mv") staged = true;
    if (subcommand === "commit") return { directory: repository, stagesChanges: staged || commitStages(words.slice(index + 1)) };
  }
  return undefined;
}

export function forbiddenStagedPath(path: string): boolean {
  const name = posix.basename(path);
  if (name === "projects.local.yml") return true;
  return name === ".env" || (name.startsWith(".env.") && name !== ".env.example");
}

export function commitGuardViolations(input: { branch: string | undefined; stagedPaths: string[]; stagedDiff: string; stagesChanges: boolean }): string[] {
  const violations: string[] = [];
  if (input.stagesChanges) violations.push("stage changes in a separate command, then commit without paths or -a/-i/-o, so the guard checks exactly what is committed");
  if (input.branch === "main" || input.branch === "master") violations.push(`commits on ${input.branch} are not allowed; create a feature branch`);
  for (const path of input.stagedPaths.filter(forbiddenStagedPath)) violations.push(`${path} must never be committed; unstage it`);
  for (const finding of findSensitiveContent(input.stagedDiff)) violations.push(`likely ${finding.kind} in the staged diff; inspect it locally and remove it`);
  return [...new Set(violations)];
}
