import { homedir } from "node:os";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { redirect, separator, tokenizeCommand } from "./git-guard.js";

export interface ToolCall {
  cwd?: string;
  tool_name?: string;
  tool_input?: { file_path?: string; notebook_path?: string; command?: string };
}

// Returns the configured project whose default clone (`<projectsDirectory>/<project>`) contains path.
// Compares case-insensitively because macOS volumes usually are.
export function defaultCloneProject(path: string, projectsDirectory: string, projectNames: string[]): string | undefined {
  const rel = relative(projectsDirectory.toLowerCase(), path.toLowerCase());
  if (rel === "" || rel.startsWith("..") || isAbsolute(rel)) return undefined;
  const name = rel.split(sep)[0]!;
  return projectNames.find((project) => project.toLowerCase() === name);
}

// Best-effort list of files a Bash command writes: redirection targets and `tee`
// arguments, resolved through earlier `cd <path>` commands. Not a full shell parser.
// shortcut: misses writes by other programs (sed -i, cp, mv, scripts); add them if agents use them in default clones.
export function bashWriteTargets(command: string, cwd: string, home = homedir()): string[] {
  const targets: string[] = [];
  // shortcut: expands only `~` and `$HOME`; other variables resolve literally and are missed.
  const resolveWord = (word: string) => resolve(directory, word.replace(/^(~|\$HOME|\$\{HOME\})(?=\/|$)/, home));
  let directory = cwd;
  let words: string[] = [];
  let redirected = false;
  const endSegment = () => {
    if (words[0] === "cd" && words[1]) directory = resolveWord(words[1]);
    if (words[0] === "tee") targets.push(...words.slice(1).filter((word) => !word.startsWith("-")).map(resolveWord));
    words = [];
  };
  for (const token of tokenizeCommand(command, true)) {
    if (token === separator) endSegment();
    else if (token === redirect) redirected = true;
    else if (redirected) {
      redirected = false;
      if (token !== "/dev/null") targets.push(resolveWord(token));
    } else words.push(token);
  }
  endSegment();
  return targets;
}

export function toolWriteTargets(call: ToolCall): string[] {
  const cwd = call.cwd ?? process.cwd();
  const input = call.tool_input ?? {};
  if (call.tool_name === "Bash") return bashWriteTargets(input.command ?? "", cwd);
  const path = input.file_path ?? input.notebook_path;
  return path ? [resolve(cwd, path)] : [];
}
