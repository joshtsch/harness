import { access, copyFile, mkdtemp, mkdir, readFile, readdir, rename, rm, stat } from "node:fs/promises";
import { constants } from "node:fs";
import { execFile } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { parse } from "yaml";

const execFileAsync = promisify(execFile);
const recordIdPattern = /^[a-z0-9][a-z0-9-]*$/;

export type SecureRecordAccess = {
  projects?: string[];
  business_lines?: string[];
  harness?: boolean;
  shared?: boolean;
};

export type SecureRecordMetadata = {
  access: SecureRecordAccess;
  provider?: string;
  plan_year?: number;
  source_documents?: string[];
};

export type SecureRecordActor =
  | { type: "harness" }
  | { type: "project"; name: string; businessLines: string[] };

export function secureDocumentsRoot(repoRoot: string): string {
  return resolve(process.env.HARNESS_SECURE_DOCUMENTS_DIR ?? join(repoRoot, ".secure-documents"));
}

export function secureRecordPath(root: string, recordId: string): string {
  if (!recordIdPattern.test(recordId)) throw new Error("record id must use lowercase letters, numbers, and hyphens");
  return join(root, `${recordId}.md.age`);
}

export function parseSecureRecord(source: string): { metadata: SecureRecordMetadata; body: string } {
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) throw new Error("secure record must start with YAML front matter");
  const metadata = parse(match[1]) as SecureRecordMetadata;
  validateAccess(metadata.access);
  return { metadata, body: match[2] };
}

export function canReadSecureRecord(access: SecureRecordAccess, actor: SecureRecordActor): boolean {
  if (access.shared) return true;
  if (actor.type === "harness") return access.harness === true;
  return (access.projects ?? []).includes(actor.name)
    || (access.business_lines ?? []).some((line) => actor.businessLines.includes(line));
}

function validateAccess(access: unknown): asserts access is SecureRecordAccess {
  if (!access || typeof access !== "object" || Array.isArray(access)) throw new Error("secure record access must be a mapping");
  const value = access as SecureRecordAccess;
  const lists = [value.projects, value.business_lines];
  if (lists.some((list) => list !== undefined && (!Array.isArray(list) || list.some((entry) => typeof entry !== "string" || entry.trim() === "")))) {
    throw new Error("secure record access targets must be lists of non-empty strings");
  }
  for (const flag of [value.harness, value.shared]) {
    if (flag !== undefined && typeof flag !== "boolean") throw new Error("secure record access flags must be boolean");
  }
  if (!(value.shared || value.harness || (value.projects?.length ?? 0) > 0 || (value.business_lines?.length ?? 0) > 0)) {
    throw new Error("secure record must declare at least one access scope");
  }
}

async function runAge(args: string[]): Promise<void> {
  try {
    await execFileAsync("age", args, { maxBuffer: 1024 * 1024 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("ENOENT") || message.includes("not found")) {
      throw new Error("age is required for secure-record operations; install age before continuing");
    }
    throw new Error(`age operation failed: ${message}`);
  }
}

export async function listSecureRecords(root: string, identityFile: string, actor: SecureRecordActor, authorize: boolean): Promise<string[]> {
  if (!authorize) throw new Error("secure-record lists require --authorize");
  try {
    const records: string[] = [];
    for (const name of (await readdir(root)).filter((entry) => entry.endsWith(".md.age")).sort()) {
      const recordId = name.slice(0, -".md.age".length);
      const source = await decryptSource(root, recordId, identityFile);
      const record = parseSecureRecord(source);
      if (canReadSecureRecord(record.metadata.access, actor)) records.push(name);
    }
    return records;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

export async function encryptSecureRecord(root: string, recordId: string, inputPath: string, recipients: string | string[]): Promise<void> {
  const input = resolve(inputPath);
  const inputStats = await stat(input);
  if (!inputStats.isFile()) throw new Error("secure record input must be a file");
  parseSecureRecord(await readFile(input, "utf8"));
  const output = secureRecordPath(root, recordId);
  await mkdir(root, { recursive: true, mode: 0o700 });
  try {
    await access(output);
    throw new Error("secure record already exists; reconcile concurrent edits before replacing it");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const staging = await mkdtemp(join(root, ".secure-record-staging-"));
  const stagedOutput = join(staging, `${recordId}.md.age`);
  try {
    const recipientArgs = (Array.isArray(recipients) ? recipients : [recipients]).flatMap((recipient) => ["-r", recipient]);
    if (recipientArgs.length === 0) throw new Error("at least one age recipient is required");
    await runAge([...recipientArgs, "-o", stagedOutput, input]);
    await copyFile(stagedOutput, output, constants.COPYFILE_EXCL);
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}

export async function rotateSecureRecord(root: string, recordId: string, oldIdentityFile: string, recipients: string[], verificationIdentityFiles: string[]): Promise<void> {
  if (recipients.length < 2) throw new Error("rotation requires primary and recovery recipients");
  if (verificationIdentityFiles.length < 2) throw new Error("rotation requires primary and recovery identities");
  const output = secureRecordPath(root, recordId);
  const previous = `${output}.previous`;
  await access(output);
  try {
    await access(previous);
    throw new Error("previous rotated ciphertext already exists; clean it up before rotating again");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const workspace = await mkdtemp(join(tmpdir(), "harness-secure-rotation-"));
  const plaintext = join(workspace, `${recordId}.md`);
  const staged = join(workspace, `${recordId}.md.age`);
  try {
    await runAge(["-d", "-i", resolve(oldIdentityFile), "-o", plaintext, output]);
    const source = await readFile(plaintext, "utf8");
    parseSecureRecord(source);
    const recipientArgs = recipients.flatMap((recipient) => ["-r", recipient]);
    await runAge([...recipientArgs, "-o", staged, plaintext]);
    for (const identityFile of verificationIdentityFiles) {
      const verified = join(workspace, `${verificationIdentityFiles.indexOf(identityFile)}.md`);
      await runAge(["-d", "-i", resolve(identityFile), "-o", verified, staged]);
      if (await readFile(verified, "utf8") !== source) throw new Error("rotation verification failed");
    }
    await rename(output, previous);
    try {
      await rename(staged, output);
    } catch (error) {
      await rename(previous, output).catch(() => undefined);
      throw error;
    }
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
}

export async function cleanupRotatedSecureRecord(root: string, recordId: string): Promise<void> {
  await rm(`${secureRecordPath(root, recordId)}.previous`, { force: true });
}

export async function decryptSecureRecord(root: string, recordId: string, identityFile: string, actor: SecureRecordActor, authorize: boolean): Promise<string> {
  if (!authorize) throw new Error("secure-record reads require --authorize");
  const source = await decryptSource(root, recordId, identityFile);
  const record = parseSecureRecord(source);
  if (!canReadSecureRecord(record.metadata.access, actor)) throw new Error("secure record scope does not permit this actor");
  return source;
}

async function decryptSource(root: string, recordId: string, identityFile: string): Promise<string> {
  const encrypted = secureRecordPath(root, recordId);
  const workspace = await mkdtemp(join(tmpdir(), "harness-secure-record-"));
  const plaintext = join(workspace, `${recordId}.md`);
  try {
    await runAge(["-d", "-i", resolve(identityFile), "-o", plaintext, encrypted]);
    return await readFile(plaintext, "utf8");
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
}

export function parseActor(value: string | undefined, businessLines: string[] = []): SecureRecordActor {
  if (value === "harness") return { type: "harness" };
  if (!value) throw new Error("actor is required; use --actor harness or --actor project:<name>");
  if (!value.startsWith("project:")) throw new Error("actor must be harness or project:<name>");
  const name = value.slice("project:".length);
  if (!name) throw new Error("project actor name must not be empty");
  return { type: "project", name, businessLines };
}

export function rootFromEnvironment(repoRoot: string): string {
  return secureDocumentsRoot(repoRoot);
}

export function identityFromEnvironment(): string {
  const identity = process.env.HARNESS_SECURE_AGE_IDENTITY;
  if (!identity) throw new Error("HARNESS_SECURE_AGE_IDENTITY is required for secure-record reads");
  return identity;
}

export function recipientFromEnvironment(): string[] {
  const recipients = process.env.HARNESS_SECURE_AGE_RECIPIENTS?.split(",").map((value) => value.trim()).filter(Boolean);
  if (!recipients || recipients.length < 2 || new Set(recipients).size !== recipients.length) throw new Error("HARNESS_SECURE_AGE_RECIPIENTS must contain distinct primary and recovery recipients");
  return recipients;
}
