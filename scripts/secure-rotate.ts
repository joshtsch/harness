import { resolve } from "node:path";
import { BitwardenKeyCustody } from "../src/bitwarden-custody.js";
import { withGeneratedCustodyPair } from "../src/custody-setup.js";
import { withTemporaryIdentity } from "../src/identity-files.js";
import { runRecoveryDrill } from "../src/recovery-drill.js";
import { cleanupRotatedSecureRecord, rootFromEnvironment, rotateSecureRecord, secureRecordPath } from "../src/secure-records.js";
import { readFile } from "node:fs/promises";
import { BitwardenSecureRecordStore } from "../src/bitwarden-records.js";
import { resolveBitwardenSession } from "../src/bitwarden-session.js";

function option(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

async function run(): Promise<void> {
  const command = process.argv[2] === "--" ? process.argv[3] : process.argv[2];
  const recordId = option("--record-id");
  if (!recordId || !["rotate", "cleanup"].includes(command ?? "")) throw new Error("usage: secure-rotate <rotate|cleanup> --record-id <id> --confirm");
  if (!process.argv.includes("--confirm")) throw new Error("explicit --confirm is required");
  const root = rootFromEnvironment(resolve(import.meta.dirname, ".."));
  if (command === "cleanup") {
    await cleanupRotatedSecureRecord(root, recordId);
    console.log(`cleaned up rollback ciphertext for ${recordId}`);
    return;
  }
  const session = await resolveBitwardenSession();
  const provider = new BitwardenKeyCustody();
  const oldPrimary = await provider.get("primary", session);
  await provider.get("recovery", session);
  await withGeneratedCustodyPair(async (primary, recovery) => {
    await runRecoveryDrill(primary, recovery);
    await withTemporaryIdentity(oldPrimary, async (oldPath) => {
      await withTemporaryIdentity(primary, async (primaryPath) => {
        await withTemporaryIdentity(recovery, async (recoveryPath) => {
          await rotateSecureRecord(root, recordId, oldPath, [primary.recipient, recovery.recipient], [primaryPath, recoveryPath]);
          await new BitwardenSecureRecordStore().put(recordId, await readFile(secureRecordPath(root, recordId)), session, true);
        });
      });
    });
    await provider.put(primary, session, true);
    await provider.put(recovery, session, true);
  });
  console.log(`rotated ${recordId}; rollback ciphertext remains until secure-rotate cleanup`);
}

run().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
