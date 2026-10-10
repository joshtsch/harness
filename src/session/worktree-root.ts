import { realpath } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

async function resolvePhysicalPath(path: string): Promise<string> {
  try {
    return await realpath(path);
  } catch (error) {
    if (typeof error !== "object" || error === null || !("code" in error) || error.code !== "ENOENT") throw error;
    const parent = dirname(path);
    if (parent === path) throw error;
    return join(await resolvePhysicalPath(parent), basename(path));
  }
}

export async function resolveWorktreeRoot(harnessRoot: string, configured = process.env.HARNESS_WORKTREE_ROOT): Promise<string> {
  const harness = await realpath(harnessRoot);
  const root = await resolvePhysicalPath(configured?.trim()
    ? resolve(harness, configured.trim())
    : join(dirname(harness), `${basename(harness)}-worktrees`));
  const location = relative(harness, root);
  if (location === "" || (!isAbsolute(location) && location !== ".." && !location.startsWith(`..${sep}`))) {
    throw new Error("worktree root must be outside the harness");
  }
  return root;
}
