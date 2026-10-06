import { readFile, rm, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { BitwardenKeyCustody } from "../src/bitwarden-custody.js";
import { setupCustody } from "../src/custody-setup.js";
import { runRecoveryDrill } from "../src/recovery-drill.js";
import { withTemporaryIdentity } from "../src/identity-files.js";
import { decryptSecureRecord, encryptSecureRecord, rootFromEnvironment, secureRecordPath } from "../src/secure-records.js";
import { BitwardenSecureRecordStore } from "../src/bitwarden-records.js";
import { resolveBitwardenSession } from "../src/bitwarden-session.js";

function option(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

async function run(): Promise<void> {
  const input = option("--input");
  const recordId = option("--record-id");
  if (!input || !recordId || !process.argv.includes("--confirm-delete-plaintext")) {
    throw new Error("usage: secure-migrate --record-id <id> --input <plaintext-file> --confirm-delete-plaintext");
  }
  const session = await resolveBitwardenSession();
  const source = resolve(input);
  if (!(await stat(source)).isFile()) throw new Error("plaintext migration source must be a file");
  const custody = await setupCustody(new BitwardenKeyCustody(), session);
  await runRecoveryDrill(custody.primary, custody.recovery);
  const root = rootFromEnvironment(resolve(import.meta.dirname, ".."));
  const configuredRecipients = process.env.HARNESS_SECURE_AGE_RECIPIENTS
    ?.split(",")
    .map((recipient) => recipient.trim())
    .filter(Boolean);
  const recipients = configuredRecipients?.length
    ? configuredRecipients
    : [custody.primary.recipient, custody.recovery.recipient];
  if (recipients.length < 2) throw new Error("migration requires primary and recovery recipients");
  if (!recipients.includes(custody.primary.recipient) || !recipients.includes(custody.recovery.recipient)) {
    throw new Error("configured recipients do not match Bitwarden custody identities");
  }
  const content = await readFile(source, "utf8");
  await withTemporaryIdentity(custody.primary, async (primaryPath) => {
    await withTemporaryIdentity(custody.recovery, async (recoveryPath) => {
      await encryptSecureRecord(root, recordId, source, recipients);
      await new BitwardenSecureRecordStore().put(recordId, await readFile(secureRecordPath(root, recordId)), session);
      const primaryContent = await decryptSecureRecord(root, recordId, primaryPath, { type: "harness" }, true);
      const recoveryContent = await decryptSecureRecord(root, recordId, recoveryPath, { type: "harness" }, true);
      if (primaryContent !== content || recoveryContent !== content) throw new Error("migration verification failed; plaintext was retained");
    });
  });
  await rm(source);
  console.log(`migrated and verified ${recordId}; removed the confirmed plaintext source`);
}

run().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
