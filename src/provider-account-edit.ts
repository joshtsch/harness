import { rename, writeFile } from "node:fs/promises";
import { Document, isMap, isScalar, parseDocument } from "yaml";
import { backupProjectConfig } from "./project-config-sync.js";

export interface ProviderAccountChanges {
  plan?: string;
  categories?: string[];
  businessLine?: string;
  personal?: boolean;
  notes?: string;
  clearNotes?: boolean;
}

export interface ProviderAccountSetResult {
  status: "added" | "changed" | "unchanged";
  /** The full projects.local.yml source after the change. */
  source: string;
  /** The final entry as it would be written. */
  entry: Record<string, unknown>;
}

/**
 * Merges changes into one provider_accounts entry, keeping comments and other entries.
 * Field values are validated by the config loader on the resulting source, not here.
 */
export function setProviderAccount(localSource: string, name: string, changes: ProviderAccountChanges): ProviderAccountSetResult {
  if (name.trim() === "") throw new Error("provider account name must be non-empty");
  if (changes.personal && changes.businessLine !== undefined) throw new Error("--personal conflicts with --business-line");
  if (changes.clearNotes && changes.notes !== undefined) throw new Error("--clear-notes conflicts with --notes");

  const document: Document = localSource.trim() === "" ? new Document({}) : parseDocument(localSource);
  if (document.errors.length > 0) throw new Error("projects.local.yml is not valid YAML");
  if (!isMap(document.contents)) throw new Error("projects.local.yml must be a mapping");
  const accounts = document.get("provider_accounts", true);
  // A bare `provider_accounts:` parses as null; treat it as an empty mapping.
  if (accounts === undefined || (isScalar(accounts) && accounts.value === null)) document.set("provider_accounts", document.createNode({}));
  else if (!isMap(accounts)) throw new Error("provider_accounts must be a mapping");

  const existing = document.getIn(["provider_accounts", name]);
  if (existing !== undefined && !isMap(existing)) throw new Error(`provider_accounts.${name} must be a mapping`);
  if (existing === undefined && (changes.plan === undefined || changes.categories === undefined)) {
    throw new Error("a new provider account needs --plan and --categories");
  }
  const before = existing === undefined ? undefined : JSON.stringify(existing.toJSON());

  const path = ["provider_accounts", name];
  if (changes.plan !== undefined) document.setIn([...path, "plan"], changes.plan);
  if (changes.categories !== undefined) document.setIn([...path, "categories"], document.createNode(changes.categories, { flow: true }));
  if (changes.businessLine !== undefined) document.setIn([...path, "business_line"], changes.businessLine);
  if (changes.personal) document.deleteIn([...path, "business_line"]);
  if (changes.notes !== undefined) document.setIn([...path, "notes"], changes.notes);
  if (changes.clearNotes) document.deleteIn([...path, "notes"]);

  const entry = (document.getIn(path) as { toJSON(): Record<string, unknown> }).toJSON();
  const status = before === undefined ? "added" : before === JSON.stringify(entry) ? "unchanged" : "changed";
  return { status, source: document.toString({ flowCollectionPadding: false }), entry };
}

export type ProviderAccountSaveResult = { backup: "updated" } | { backup: "skipped" } | { backup: "failed"; error: Error };

/** Writes projects.local.yml, then replaces the encrypted backup unless skipped. The local write is kept if the backup fails. */
export async function saveProviderAccountChange(publicConfigPath: string, localConfigPath: string, source: string, skipBackup: boolean): Promise<ProviderAccountSaveResult> {
  // Write then rename so a crash cannot leave a truncated private config.
  const temporaryPath = `${localConfigPath}.${process.pid}.tmp`;
  await writeFile(temporaryPath, source, { mode: 0o600 });
  await rename(temporaryPath, localConfigPath);
  if (skipBackup) return { backup: "skipped" };
  try {
    await backupProjectConfig(publicConfigPath, localConfigPath, true);
    return { backup: "updated" };
  } catch (error) {
    return { backup: "failed", error: error instanceof Error ? error : new Error(String(error)) };
  }
}
