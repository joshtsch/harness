export const worktreeUsage = "Usage: pnpm worktree [--refresh] [--provisional] [--branch <branch>] [--base <origin-branch>] <project-name> <issue-key> <ticket-title>";

export function parseWorktreeArgs(args: string[]): { projectName: string; issueKey: string; ticketTitle: string; refresh: boolean; provisional: boolean; branch?: string; base?: string } {
  const positional: string[] = [];
  const flags = new Map<string, string>();
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg.startsWith("--")) { positional.push(arg); continue; }
    if (!["--refresh", "--provisional", "--branch", "--base"].includes(arg) || flags.has(arg)) throw new Error(worktreeUsage);
    const value = arg === "--refresh" || arg === "--provisional" ? "true" : args[++index];
    if (!value || value.startsWith("-")) throw new Error(worktreeUsage);
    flags.set(arg, value);
  }
  const [projectName, issueKey, ...title] = positional;
  if (!projectName || !issueKey || !title.length) throw new Error(worktreeUsage);
  if (flags.has("--provisional") && flags.has("--branch")) throw new Error("--provisional creates its own provisional- branch; omit --branch");
  return { projectName, issueKey, ticketTitle: title.join(" "), refresh: flags.has("--refresh"), provisional: flags.has("--provisional"), branch: flags.get("--branch"), base: flags.get("--base") };
}
