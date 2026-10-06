import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { CustodyIdentity } from "./key-custody.js";
import { parseCustodyIdentity, serializeCustodyIdentity } from "./key-custody.js";

const execFileAsync = promisify(execFile);

export async function exportRecoveryIdentity(identity: CustodyIdentity, exportPath: string, recipient: string): Promise<void> {
  if (identity.role !== "recovery") throw new Error("only the recovery identity may be exported");
  const output = resolve(exportPath);
  const directory = await mkdtemp(join(tmpdir(), "harness-recovery-export-"));
  const plaintext = join(directory, "recovery.json");
  try {
    await writeFile(plaintext, serializeCustodyIdentity(identity), { mode: 0o600 });
    await execFileAsync("age", ["-r", recipient, "-o", output, plaintext]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

export async function importRecoveryIdentity(exportPath: string, identityPath: string): Promise<CustodyIdentity> {
  const directory = await mkdtemp(join(tmpdir(), "harness-recovery-import-"));
  const plaintext = join(directory, "recovery.json");
  try {
    if (!(await stat(resolve(exportPath))).isFile()) throw new Error("recovery export must be a file");
    await execFileAsync("age", ["-d", "-i", resolve(identityPath), "-o", plaintext, resolve(exportPath)]);
    return parseCustodyIdentity(await readFile(plaintext, "utf8"), "recovery");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
