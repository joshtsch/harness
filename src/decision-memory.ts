import { constants } from "node:fs";
import { lstat, mkdir, open, readFile, rename, rm, chmod, link, type FileHandle } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { findSensitiveContent } from "./sensitive-content.js";
import { assertMemoryApproval, createMemoryProposal, requestsMemoryApply, type MemoryApproval, type MemoryProposal } from "./memory-proposal.js";

const schemaVersion = 1;
const maximumFileBytes = 1024 * 1024;
const identifierPattern = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const scopeKeys = ["user", "businessLine", "project", "environment"] as const;

export interface DecisionMemoryScope {
  user: string;
  businessLine?: string;
  project?: string;
  environment?: string;
}

export interface DecisionMemoryRecord {
  id: string;
  category: string;
  scope: DecisionMemoryScope;
  preference: string;
  rationale?: string;
  confidence: number;
  provenance: {
    authority: "user-confirmed";
    confirmedAt: string;
    source: string;
  };
  reviewAfter: string;
}

export interface DecisionMemoryQuery {
  category: string;
  scope: DecisionMemoryScope;
}

export interface ProjectDecisionContext {
  actualProjectValue: string;
  decisionRecord?: { path: string; verified: true };
}

export type DecisionDeviation =
  | { status: "not-assessed" }
  | { status: "none"; actual: string }
  | { status: "documented"; actual: string; decisionRecord: string }
  | { status: "undocumented"; actual: string };

export interface DecisionMemoryResult {
  status: "not-found" | "available" | "stale" | "conflict";
  category: string;
  scope: DecisionMemoryScope;
  preference?: DecisionMemoryRecord;
  confidence?: number;
  freshness: "fresh" | "stale" | "not-applicable";
  staleRecordIds: string[];
  deviation: DecisionDeviation;
}

export interface DecisionMemoryWriteResult {
  mode: "dry-run" | "applied";
  proposal: MemoryProposal;
}

export interface DecisionMemoryProvider {
  list(): Promise<DecisionMemoryRecord[]>;
  record(record: DecisionMemoryRecord, options?: MemoryApproval & { replaceId?: string }): Promise<DecisionMemoryWriteResult>;
  forget(id: string, options?: MemoryApproval): Promise<DecisionMemoryWriteResult>;
}

export function decisionMemoryFilePath(home = homedir()): string {
  return resolve(home, ".local", "state", "harness", "decision-memory.json");
}

export function resolveDecisionMemory(
  query: DecisionMemoryQuery,
  records: DecisionMemoryRecord[],
  options: { now?: Date; project?: ProjectDecisionContext } = {},
): DecisionMemoryResult {
  validateQuery(query);
  for (const record of records) validateRecord(record);
  const applicable = records.filter((record) => record.category === query.category && scopeApplies(record.scope, query.scope));
  const freshestByScope = mostSpecific(applicable);
  if (freshestByScope.length === 0) {
    return {
      status: "not-found", category: query.category, scope: query.scope,
      freshness: "not-applicable", staleRecordIds: [], deviation: { status: "not-assessed" },
    };
  }

  if (new Set(freshestByScope.map((record) => record.preference)).size > 1) {
    return {
      status: "conflict", category: query.category, scope: query.scope,
      freshness: "not-applicable", staleRecordIds: [], deviation: { status: "not-assessed" },
    };
  }

  const now = options.now ?? new Date();
  const stale = freshestByScope.filter((record) => Date.parse(record.reviewAfter) <= now.getTime());
  if (stale.length === freshestByScope.length) {
    return {
      status: "stale", category: query.category, scope: query.scope,
      freshness: "stale", staleRecordIds: stale.map((record) => record.id).sort(),
      deviation: { status: "not-assessed" },
    };
  }

  const preference = freshestByScope.filter((record) => Date.parse(record.reviewAfter) > now.getTime())
    .sort((left, right) => right.provenance.confirmedAt.localeCompare(left.provenance.confirmedAt) || left.id.localeCompare(right.id))[0]!;
  return {
    status: "available", category: query.category, scope: query.scope,
    preference, confidence: preference.confidence, freshness: "fresh",
    staleRecordIds: stale.map((record) => record.id).sort(),
    deviation: assessDeviation(preference.preference, options.project),
  };
}

export class LocalJsonDecisionMemoryStore implements DecisionMemoryProvider {
  private readonly filePath: string;
  private readonly directory: string;

  constructor(filePath = decisionMemoryFilePath()) {
    this.filePath = resolve(filePath);
    this.directory = dirname(this.filePath);
  }

  async list(): Promise<DecisionMemoryRecord[]> {
    return (await this.readDocument()).records;
  }

  private async readDocument(): Promise<{ records: DecisionMemoryRecord[]; source: string | null }> {
    assertSupportedPlatform();
    try {
      await this.assertSecureDirectory(false);
      const fileInfo = await lstat(this.filePath);
      if (!fileInfo.isFile() || fileInfo.isSymbolicLink() || unsafeMode(fileInfo.mode) || !ownedByCurrentUser(fileInfo.uid)) {
        throw new Error("decision memory file permissions are unsafe");
      }
      if (fileInfo.size > maximumFileBytes) throw new Error("decision memory file exceeds the size limit");
      const source = await readFile(this.filePath, "utf8");
      return { records: parseDocument(source).records, source };
    } catch (error) {
      if (isMissing(error)) return { records: [], source: null };
      if (error instanceof SyntaxError || error instanceof TypeError) throw new Error("invalid decision memory data");
      throw error;
    }
  }

  async record(record: DecisionMemoryRecord, options: MemoryApproval & { replaceId?: string } = {}): Promise<DecisionMemoryWriteResult> {
    const input = structuredClone(record);
    validateRecord(input);
    const prepare = async () => {
      const { records: current, source } = await this.readDocument();
      const existingById = current.find((candidate) => candidate.id === input.id);
      const sameScope = current.find((candidate) => candidate.id !== input.id
        && candidate.category === input.category && scopesEqual(candidate.scope, input.scope));
      if (options.replaceId) {
        const target = current.find((candidate) => candidate.id === options.replaceId);
        if (!target || target.id !== input.id) throw new Error("replacement target must match the existing record id");
        if (target.category !== input.category || !scopesEqual(target.scope, input.scope)) {
          throw new Error("replacement must keep the existing category and scope");
        }
      } else if (existingById || sameScope) {
        throw new Error("an existing record requires explicit replacement");
      }
      const next = options.replaceId
        ? current.map((candidate) => candidate.id === options.replaceId ? input : candidate)
        : [...current, input];
      return { next, proposal: this.proposal(source, next, ["record", input.provenance.source, input.provenance.confirmedAt, options.replaceId ?? "new record"]) };
    };
    return this.writeReviewed(prepare, options);
  }

  async forget(id: string, options: MemoryApproval = {}): Promise<DecisionMemoryWriteResult> {
    if (!identifierPattern.test(id)) throw new Error("invalid decision memory id");
    const prepare = async () => {
      const { records: current, source } = await this.readDocument();
      if (!current.some((record) => record.id === id)) throw new Error("decision memory record was not found");
      const next = current.filter((record) => record.id !== id);
      return { next, proposal: this.proposal(source, next, ["forget", id]) };
    };
    return this.writeReviewed(prepare, options);
  }

  private proposal(before: string | null, next: DecisionMemoryRecord[], evidence: string[]): MemoryProposal {
    const after = JSON.stringify({ version: schemaVersion, records: next }, null, 2);
    if (Buffer.byteLength(after) > maximumFileBytes) throw new Error("decision memory file exceeds the size limit");
    return createMemoryProposal([{ destination: this.filePath, before, after }],
      evidence, ["record schema, scope, privacy, replacement and owner-only storage checked"]);
  }

  private async writeReviewed(prepare: () => Promise<{ next: DecisionMemoryRecord[]; proposal: MemoryProposal }>, approval: MemoryApproval): Promise<DecisionMemoryWriteResult> {
    const review = await prepare();
    if (!requestsMemoryApply(approval)) return { mode: "dry-run", proposal: review.proposal };
    assertMemoryApproval(review.proposal, approval);
    return this.withWriteLock(async () => {
      const fresh = await prepare();
      assertMemoryApproval(fresh.proposal, approval);
      await this.writeDocumentUnlocked(fresh.next);
      return { mode: "applied", proposal: fresh.proposal };
    });
  }

  private async assertSecureDirectory(create: boolean): Promise<void> {
    if (create) {
      const created = await mkdir(this.directory, { recursive: true, mode: 0o700 });
      if (created) await chmod(this.directory, 0o700).catch(() => { throw new Error("unable to secure decision memory directory"); });
    }
    const info = await lstat(this.directory);
    if (!info.isDirectory() || info.isSymbolicLink() || unsafeMode(info.mode) || !ownedByCurrentUser(info.uid)) {
      throw new Error("decision memory directory permissions are unsafe");
    }
  }

  private async withWriteLock<T>(operation: () => Promise<T>): Promise<T> {
    await this.assertSecureDirectory(true);
    const lockPath = `${this.filePath}.lock`;
    const lock = await acquireWriteLock(lockPath);
    try {
      return await operation();
    } finally {
      await lock.close();
      await rm(lockPath, { force: true });
    }
  }

  private async writeDocumentUnlocked(records: DecisionMemoryRecord[]): Promise<void> {
    const temporaryPath = join(this.directory, `.decision-memory-${randomUUID()}.tmp`);
    try {
      const temporary = await open(temporaryPath, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600);
      try {
        await temporary.writeFile(JSON.stringify({ version: schemaVersion, records }, null, 2), "utf8");
        await temporary.sync();
      } finally {
        await temporary.close();
      }
      await rename(temporaryPath, this.filePath);
    } finally {
      await rm(temporaryPath, { force: true });
    }
  }
}

function parseDocument(source: string): { records: DecisionMemoryRecord[] } {
  let value: unknown;
  try { value = JSON.parse(source); } catch { throw new Error("invalid decision memory data"); }
  if (!isObject(value) || value.version !== schemaVersion || !Array.isArray(value.records)) throw new Error("invalid decision memory data");
  const records = value.records.map((candidate) => {
    validateRecord(candidate);
    return candidate;
  });
  if (new Set(records.map((record) => record.id)).size !== records.length) throw new Error("invalid decision memory data");
  return { records };
}

function validateRecord(value: unknown): asserts value is DecisionMemoryRecord {
  if (!isObject(value) || Object.keys(value).some((key) => !["id", "category", "scope", "preference", "rationale", "confidence", "provenance", "reviewAfter"].includes(key))
    || typeof value.id !== "string" || !identifierPattern.test(value.id)
    || typeof value.category !== "string" || !identifierPattern.test(value.category)) {
    throw new Error("invalid decision memory record");
  }
  if (!isObject(value.scope)) throw new Error("invalid decision memory scope");
  const recordScope = value.scope;
  if (Object.keys(recordScope).some((key) => !(scopeKeys as readonly string[]).includes(key))) throw new Error("invalid decision memory scope");
  if (typeof recordScope.user !== "string" || !recordScope.user.trim() || Object.keys(recordScope).some((key) => typeof recordScope[key] !== "string" || !String(recordScope[key]).trim())) {
    throw new Error("invalid decision memory scope");
  }
  if (typeof value.preference !== "string" || !value.preference.trim() || value.preference.length > 500 || /[\r\n]/.test(value.preference)) throw new Error("invalid decision memory preference");
  if (value.rationale !== undefined && (typeof value.rationale !== "string" || value.rationale.length > 500 || /[\r\n]/.test(value.rationale))) throw new Error("invalid decision memory rationale");
  if (typeof value.confidence !== "number" || !Number.isFinite(value.confidence) || value.confidence < 0 || value.confidence > 1) throw new Error("invalid decision memory confidence");
  if (!isObject(value.provenance) || Object.keys(value.provenance).some((key) => !["authority", "confirmedAt", "source"].includes(key))
    || value.provenance.authority !== "user-confirmed" || typeof value.provenance.confirmedAt !== "string" || !isDate(value.provenance.confirmedAt) || typeof value.provenance.source !== "string" || !value.provenance.source.trim() || value.provenance.source.length > 300) {
    throw new Error("invalid decision memory provenance");
  }
  if (typeof value.reviewAfter !== "string" || !isDate(value.reviewAfter)) throw new Error("invalid decision memory review date");
  const serialized = JSON.stringify(value);
  const diff = serialized.split("\n").map((line) => `+${line}`).join("\n");
  if (findSensitiveContent(diff).length) throw new Error("decision memory records cannot contain likely sensitive content");
}

function validateQuery(query: DecisionMemoryQuery): void {
  if (!query || typeof query.category !== "string" || !identifierPattern.test(query.category) || !isObject(query.scope)) {
    throw new Error("invalid decision memory query");
  }
  const queryScope = query.scope as unknown as Record<string, unknown>;
  if (typeof queryScope.user !== "string" || !queryScope.user.trim()
    || Object.keys(queryScope).some((key) => !(scopeKeys as readonly string[]).includes(key) || typeof queryScope[key] !== "string" || !String(queryScope[key]).trim())) throw new Error("invalid decision memory query");
}

function scopeApplies(record: DecisionMemoryScope, query: DecisionMemoryScope): boolean {
  return scopeKeys.every((key) => record[key] === undefined || record[key] === query[key]);
}

function mostSpecific(records: DecisionMemoryRecord[]): DecisionMemoryRecord[] {
  return records.filter((candidate) => !records.some((other) => moreSpecific(other.scope, candidate.scope)));
}

function moreSpecific(left: DecisionMemoryScope, right: DecisionMemoryScope): boolean {
  const leftKeys = scopeKeys.filter((key) => left[key] !== undefined);
  const rightKeys = scopeKeys.filter((key) => right[key] !== undefined);
  return leftKeys.length > rightKeys.length && rightKeys.every((key) => left[key] === right[key]);
}

function scopesEqual(left: DecisionMemoryScope, right: DecisionMemoryScope): boolean {
  return scopeKeys.every((key) => left[key] === right[key]);
}

function assessDeviation(preference: string, project?: ProjectDecisionContext): DecisionDeviation {
  if (!project) return { status: "not-assessed" };
  if (project.actualProjectValue === preference) return { status: "none", actual: project.actualProjectValue };
  return project.decisionRecord
    ? { status: "documented", actual: project.actualProjectValue, decisionRecord: project.decisionRecord.path }
    : { status: "undocumented", actual: project.actualProjectValue };
}

function isDate(value: string): boolean {
  return Number.isFinite(Date.parse(value));
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function unsafeMode(mode: number): boolean {
  return process.platform !== "win32" && (mode & 0o077) !== 0;
}

function assertSupportedPlatform(): void {
  if (process.platform === "win32") throw new Error("local decision memory requires verifiable owner-only filesystem permissions; this provider does not support Windows yet");
}

function ownedByCurrentUser(uid: number): boolean {
  return typeof process.getuid !== "function" || uid === process.getuid();
}

function isMissing(error: unknown): boolean {
  return (error as NodeJS.ErrnoException).code === "ENOENT";
}

async function acquireWriteLock(path: string): Promise<FileHandle> {
  const temporaryPath = join(dirname(path), `.decision-memory-lock-${randomUUID()}.tmp`);
  const temporary = await open(temporaryPath, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600);
  let published = false;
  let closed = false;
  try {
    await temporary.writeFile(JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() }), "utf8");
    await temporary.sync();
    try {
      await link(temporaryPath, path);
    } catch (error) {
      await temporary.close();
      closed = true;
      await rm(temporaryPath, { force: true });
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      return await inspectExistingLock(path);
    }
    published = true;
    await rm(temporaryPath);
    return temporary;
  } catch (error) {
    if (published) await rm(path, { force: true });
    if (!closed) await temporary.close().catch(() => undefined);
    await rm(temporaryPath, { force: true });
    throw error;
  }
}

async function inspectExistingLock(path: string): Promise<FileHandle> {
  try {
    const [info, contents] = await Promise.all([lstat(path), readFile(path, "utf8")]);
    if (info.isSymbolicLink() || unsafeMode(info.mode) || !ownedByCurrentUser(info.uid)) throw new Error("decision memory lock permissions are unsafe");
    let lock: unknown;
    try { lock = JSON.parse(contents); } catch { throw new Error("decision memory lock is invalid; inspect it before retrying"); }
    if (!isObject(lock) || typeof lock.pid !== "number" || !Number.isInteger(lock.pid) || lock.pid < 1 || typeof lock.createdAt !== "string" || !isDate(lock.createdAt)) {
      throw new Error("decision memory lock is invalid; inspect it before retrying");
    }
    const oldEnough = Date.now() - Date.parse(lock.createdAt) > 60_000;
    if (!oldEnough || processIsAlive(lock.pid)) throw new Error("decision memory is being updated; retry after the other write completes");
    throw new Error("decision memory lock is stale; verify no writer is active, then remove the lock file before retrying");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return acquireWriteLock(path);
    throw error;
  }
}

function processIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== "ESRCH";
  }
}
