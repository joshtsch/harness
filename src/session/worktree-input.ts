export const worktreeUsage = "Usage: pnpm worktree [--refresh] [--branch <branch>] [--base <origin-branch>] <project-name> <issue-key> <ticket-title>";

export function parseWorktreeArgs(args: string[]): { projectName: string; issueKey: string; ticketTitle: string; refresh: boolean; branch?: string; base?: string } {
  const positional: string[] = [];
  const flags = new Map<string, string>();
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg.startsWith("--")) { positional.push(arg); continue; }
    if (!["--refresh", "--branch", "--base"].includes(arg) || flags.has(arg)) throw new Error(worktreeUsage);
    const value = arg === "--refresh" ? "true" : args[++index];
    if (!value || value.startsWith("-")) throw new Error(worktreeUsage);
    flags.set(arg, value);
  }
  const [projectName, issueKey, ...title] = positional;
  if (!projectName || !issueKey || !title.length) throw new Error(worktreeUsage);
  return { projectName, issueKey, ticketTitle: title.join(" "), refresh: flags.has("--refresh"), branch: flags.get("--branch"), base: flags.get("--base") };
}
