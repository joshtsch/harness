import { chmod, mkdir, stat } from "node:fs/promises";
import { execFile } from "node:child_process";
import { homedir } from "node:os";
import { dirname, relative, resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const recipientPattern = /(?:Public key: )?(age1[0-9a-z]+)/;

export function defaultIdentityPath(): string {
  return resolve(homedir(), ".config", "age", "harness-identity.txt");
}

export function assertIdentityOutsideRepository(identityPath: string, repoRoot: string): string {
  const resolved = resolve(identityPath);
  const relativePath = relative(resolve(repoRoot), resolved);
  if (relativePath === "" || (!relativePath.startsWith("..") && !relativePath.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`))) {
    throw new Error("age identity must be stored outside the harness repository");
  }
  return resolved;
}

async function runAgeKeygen(args: string[]): Promise<{ stdout: string; stderr: string }> {
  try {
    return await execFileAsync("age-keygen", args, { maxBuffer: 1024 * 1024 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("ENOENT") || message.includes("not found")) {
      throw new Error("age-keygen is required; install age before continuing");
    }
    throw new Error(`age-keygen operation failed: ${message}`);
  }
}

export async function initializeAgeIdentity(identityPath: string, repoRoot: string): Promise<{ identityPath: string; recipient: string; created: boolean }> {
  const resolved = assertIdentityOutsideRepository(identityPath, repoRoot);
  let created = false;
  try {
    const existing = await stat(resolved);
    if (!existing.isFile()) throw new Error("age identity path must be a file");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    await mkdir(dirname(resolved), { recursive: true, mode: 0o700 });
    await runAgeKeygen(["-o", resolved]);
    created = true;
  }
  await chmod(resolved, 0o600);
  const result = await runAgeKeygen(["-y", resolved]);
  const output = `${result.stdout}\n${result.stderr}`;
  const recipient = output.match(recipientPattern)?.[1];
  if (!recipient) throw new Error("could not determine the age recipient from the identity");
  return { identityPath: resolved, recipient, created };
}
