import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { CustodyIdentity } from "./key-custody.js";
import { withTemporaryIdentity } from "./identity-files.js";

const execFileAsync = promisify(execFile);

export async function runRecoveryDrill(primary: CustodyIdentity, recovery: CustodyIdentity): Promise<void> {
  if (primary.recipient === recovery.recipient) throw new Error("primary and recovery recipients must be distinct");
  const directory = await mkdtemp(join(tmpdir(), "harness-recovery-drill-"));
  const input = join(directory, "disposable.md");
  const encrypted = join(directory, "disposable.md.age");
  try {
    const content = "recovery drill\n";
    await writeFile(input, content, { mode: 0o600 });
    await execFileAsync("age", ["-r", primary.recipient, "-r", recovery.recipient, "-o", encrypted, input]);
    await withTemporaryIdentity(primary, async (primaryPath) => {
      await verifyDecryption(encrypted, primaryPath, join(directory, "primary.md"), content);
      await withTemporaryIdentity(recovery, async (recoveryPath) => {
        await verifyDecryption(encrypted, recoveryPath, join(directory, "recovery.md"), content);
      });
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function verifyDecryption(encrypted: string, identity: string, output: string, expected: string): Promise<void> {
  await execFileAsync("age", ["-d", "-i", identity, "-o", output, encrypted]);
  if (await readFile(output, "utf8") !== expected) throw new Error("recovery drill content verification failed");
}
