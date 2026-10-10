import type { CommandRunner, WorktreeProject } from "./worktree.js";

export interface ProjectRefreshResult {
  status: "updated" | "current" | "skipped";
  reason?: string;
}

export async function refreshProjectClone(project: WorktreeProject, run: CommandRunner): Promise<ProjectRefreshResult> {
  const git = (...args: string[]) => run("git", ["-C", project.path, ...args]);
  const skipped = (reason: string): ProjectRefreshResult => ({ status: "skipped", reason });
  const current = await git("symbolic-ref", "--short", "HEAD");
  if (current.code !== 0 || current.stdout.trim() !== project.defaultBranch) return skipped("default branch is not checked out");
  const status = await git("status", "--porcelain", "--untracked-files=all");
  if (status.code !== 0) return skipped("cannot inspect working tree");
  if (status.stdout.trim()) return skipped("working tree is dirty");
  const fetch = await git("fetch", "--prune", "origin");
  if (fetch.code !== 0) return skipped("origin fetch failed");
  const local = await git("rev-parse", "--verify", `refs/heads/${project.defaultBranch}^{commit}`);
  const remote = await git("rev-parse", "--verify", `refs/remotes/origin/${project.defaultBranch}^{commit}`);
  if (local.code !== 0 || remote.code !== 0) return skipped("default branch reference is unavailable");
  if (local.stdout.trim() === remote.stdout.trim()) return { status: "current" };
  const ancestor = await git("merge-base", "--is-ancestor", local.stdout.trim(), remote.stdout.trim());
  if (ancestor.code !== 0) return skipped("local default branch is ahead, divergent, or cannot be compared");
  const recheck = await git("status", "--porcelain", "--untracked-files=all");
  const branch = await git("symbolic-ref", "--short", "HEAD");
  if (recheck.code !== 0 || recheck.stdout.trim() || branch.code !== 0 || branch.stdout.trim() !== project.defaultBranch) return skipped("working tree changed during refresh");
  const merge = await git("merge", "--ff-only", remote.stdout.trim());
  return merge.code === 0 ? { status: "updated" } : skipped("fast-forward failed");
}
