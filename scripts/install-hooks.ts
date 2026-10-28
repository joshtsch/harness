import { execFile } from "node:child_process";
import { access } from "node:fs/promises";
import { constants } from "node:fs";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const exec = promisify(execFile);

export async function installPrivacyHook(root: string): Promise<string> {
  await access(resolve(root, ".githooks/pre-commit"), constants.X_OK);
  let configured = "";
  try { configured = (await exec("git", ["config", "--get", "core.hooksPath"], { cwd: root })).stdout.trim(); }
  catch (error) { if (!(error instanceof Error && "code" in error && error.code === 1)) throw error; }
  if (configured === ".githooks") return "Privacy hook already configured.";
  if (configured) throw new Error("Existing core.hooksPath preserved; add the staged privacy check to that hook manually.");
  const { stdout } = await exec("git", ["rev-parse", "--git-path", "hooks/pre-commit"], { cwd: root });
  try { await access(resolve(root, stdout.trim())); }
  catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
    await exec("git", ["config", "--local", "core.hooksPath", ".githooks"], { cwd: root });
    return "Staged privacy hook enabled for this clone.";
  }
  throw new Error("Existing pre-commit hook preserved; add the staged privacy check to that hook manually.");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  installPrivacyHook(resolve(".")).then(console.log).catch(() => {
    console.error("Hook installation failed; existing hooks were preserved. See docs/agents/tooling.md#repository-checks-and-hooks.");
    process.exitCode = 1;
  });
}
