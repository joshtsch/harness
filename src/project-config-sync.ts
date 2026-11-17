import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BitwardenSecureRecordStore } from "./bitwarden-records.js";
import { resolveBitwardenSession } from "./bitwarden-session.js";
import { loadProjectsConfig } from "./project-config.js";
import { encryptSecureRecord, parseSecureRecord, recipientFromEnvironment, secureRecordPath } from "./secure-records.js";

export const projectConfigRecordId = "projects-config";

export function projectConfigRecordSource(config: string): string {
  if (!config.trim()) throw new Error("local project configuration is empty");
  return `---\naccess:\n  harness: true\n---\n${config}`;
}

export function projectConfigFromRecord(source: string): string {
  const body = parseSecureRecord(source).body;
  if (!body.trim()) throw new Error("stored project configuration is empty");
  return body;
}

/** Validates the local configuration and stores it as the encrypted Bitwarden record. */
export async function backupProjectConfig(publicConfigPath: string, localConfigPath: string, replace: boolean): Promise<void> {
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
}
