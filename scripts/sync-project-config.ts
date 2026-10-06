import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { BitwardenSecureRecordStore } from "../src/bitwarden-records.js";
import { projectConfigFromRecord, projectConfigRecordId, projectConfigRecordSource } from "../src/project-config-sync.js";
import { loadProjectsConfig } from "../src/project-config.js";
import { decryptSecureRecord, encryptSecureRecord, recipientFromEnvironment, secureRecordPath } from "../src/secure-records.js";
import { resolveBitwardenSession } from "../src/bitwarden-session.js";
import { withTemporaryIdentity } from "../src/identity-files.js";
import { BitwardenKeyCustody } from "../src/bitwarden-custody.js";

const repoRoot = resolve(import.meta.dirname, "..");
const publicConfigPath = join(repoRoot, "projects.yml");
const localConfigPath = join(repoRoot, "projects.local.yml");

async function backup(replace: boolean): Promise<void> {
  const config = await readFile(localConfigPath, "utf8");
  await loadProjectsConfig(publicConfigPath, { localConfigPath });
  const session = await resolveBitwardenSession();
  const staging = await mkdtemp(join(tmpdir(), "harness-project-config-"));
  const sourcePath = join(staging, "projects.local.yml.md");
  try {
    await writeFile(sourcePath, projectConfigRecordSource(config), { mode: 0o600 });
    await encryptSecureRecord(staging, projectConfigRecordId, sourcePath, recipientFromEnvironment());
    const ciphertext = await readFile(secureRecordPath(staging, projectConfigRecordId));
    await new BitwardenSecureRecordStore().put(projectConfigRecordId, ciphertext, session, replace);
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
  console.log(`stored encrypted project configuration ${projectConfigRecordId}`);
}

async function restore(replace: boolean): Promise<void> {
  if (!replace) {
    try {
      await stat(localConfigPath);
      throw new Error("projects.local.yml exists; pass --replace to overwrite it");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  const session = await resolveBitwardenSession();
  const ciphertext = await new BitwardenSecureRecordStore().get(projectConfigRecordId, session);
  if (!ciphertext) throw new Error(`Bitwarden project configuration not found: ${projectConfigRecordId}`);
  const staging = await mkdtemp(join(tmpdir(), "harness-project-config-"));
  try {
    await writeFile(secureRecordPath(staging, projectConfigRecordId), ciphertext, { mode: 0o600 });
    const custodyIdentity = await new BitwardenKeyCustody().get("primary", session);
    await withTemporaryIdentity(custodyIdentity, async (identityPath) => {
      const source = await decryptSecureRecord(staging, projectConfigRecordId, identityPath, { type: "harness" }, true);
      const config = projectConfigFromRecord(source);
      const restoredPath = join(staging, "projects.local.yml");
      await writeFile(restoredPath, config, { mode: 0o600 });
      await loadProjectsConfig(publicConfigPath, { localConfigPath: restoredPath });
      await writeFile(localConfigPath, config, { mode: 0o600 });
    });
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
  console.log("restored projects.local.yml");
}

const [command, ...args] = process.argv.slice(2);
const replace = args.includes("--replace");
if (command === "backup") backup(replace).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
else if (command === "restore") restore(replace).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
else {
  console.error("usage: sync-project-config <backup|restore> [--replace]");
  process.exitCode = 1;
}
