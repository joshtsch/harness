import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { loadProjectsConfig } from "../src/project-config.js";
import { BitwardenKeyCustody } from "../src/bitwarden-custody.js";
import {
  decryptSecureRecord,
  encryptSecureRecord,
  listSecureRecords,
  parseActor,
  recipientFromEnvironment,
  rootFromEnvironment,
  secureRecordPath,
} from "../src/secure-records.js";
import { BitwardenSecureRecordStore } from "../src/bitwarden-records.js";
import { resolveBitwardenSession } from "../src/bitwarden-session.js";
import { withTemporaryIdentity } from "../src/identity-files.js";

const repoRoot = resolve(import.meta.dirname, "..");
const rawArgs = process.argv.slice(2);
const [command, ...args] = rawArgs[0] === "--" ? rawArgs.slice(1) : rawArgs;

function option(name: string): string | undefined {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
}

async function actor() {
  const value = option("--actor");
  if (!value?.startsWith("project:")) return parseActor(value);
  const projectName = value.slice("project:".length);
  const projects = await loadProjectsConfig(join(repoRoot, "projects.yml"));
  const project = projects[projectName];
  if (!project) throw new Error(`unknown project: ${projectName}`);
  return parseActor(value, project.businessLines);
}

async function withReadIdentity<T>(session: string, action: (identity: string) => Promise<T>): Promise<T> {
  const configuredIdentity = process.env.HARNESS_SECURE_AGE_IDENTITY;
  if (configuredIdentity) return action(configuredIdentity);
  const custodyIdentity = await new BitwardenKeyCustody().get("primary", session);
  return withTemporaryIdentity(custodyIdentity, action);
}

async function run(): Promise<void> {
  const root = rootFromEnvironment(repoRoot);
  if (command === "list") {
    const authorizedActor = await actor();
    if (!args.includes("--authorize")) throw new Error("secure-record lists require --authorize");
    const session = await resolveBitwardenSession();
    await withReadIdentity(session, async (identity) => {
      const localRecords = await listSecureRecords(root, identity, authorizedActor, true);
      const store = new BitwardenSecureRecordStore();
      const bitwardenRecords: string[] = [];
      for (const recordId of await store.list(session)) {
        const ciphertext = await store.get(recordId, session);
        if (!ciphertext) continue;
        const staging = await mkdtemp(join(root, ".bitwarden-record-"));
        try {
          await writeFile(join(staging, `${recordId}.md.age`), ciphertext);
          await decryptSecureRecord(staging, recordId, identity, authorizedActor, true);
          bitwardenRecords.push(`${recordId}.md.age`);
        } finally { await rm(staging, { recursive: true, force: true }); }
      }
      for (const record of [...new Set([...localRecords, ...bitwardenRecords])].sort()) console.log(record);
    });
    return;
  }
  const recordId = args[0];
  if (!recordId) throw new Error("record id is required");
  if (command === "read") {
    const authorizedActor = await actor();
    if (!args.includes("--authorize")) throw new Error("secure-record reads require --authorize");
    const session = await resolveBitwardenSession();
    await withReadIdentity(session, async (identity) => {
      const ciphertext = await new BitwardenSecureRecordStore().get(recordId, session);
      if (!ciphertext) {
        process.stdout.write(await decryptSecureRecord(root, recordId, identity, authorizedActor, true));
      } else {
        const staging = await mkdtemp(join(root, ".bitwarden-record-"));
        try {
          await writeFile(join(staging, `${recordId}.md.age`), ciphertext);
          process.stdout.write(await decryptSecureRecord(staging, recordId, identity, authorizedActor, true));
        } finally { await rm(staging, { recursive: true, force: true }); }
      }
    });
    return;
  }
  if (command === "write") {
    const input = option("--input");
    if (!input) throw new Error("--input is required");
    await encryptSecureRecord(root, recordId, input, recipientFromEnvironment());
    const session = await resolveBitwardenSession();
    await new BitwardenSecureRecordStore().put(recordId, await readFile(secureRecordPath(root, recordId)), session);
    console.log(`stored encrypted secure note ${recordId}`);
    return;
  }
  throw new Error("usage: secure-record <list|read|write> [record-id] [options]");
}

run().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
