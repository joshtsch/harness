import { createHash, randomUUID } from "node:crypto";
import { chmod, lstat, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { artifactKey, claim, projectsLocalRecordKey, save, type ArtifactContent, type ContinuationArtifact, type ContinuationManifest, type ContinuationSaveIntent, type ContinuationStore, type ContinuationUserRecordStore } from "./continuation.js";
import { ContinuationRevisionConflictError } from "./supabase-continuation-store.js";
import { assertSafeContinuationArtifact } from "./continuation-content-policy.js";
import { commitProjectsLocalProjection, mergeProjectsLocal } from "./projects-local-projection.js";

const maxQueueEntryBytes = 16 * 1024 * 1024;
const defaultQueueDirectory = join(tmpdir(), "harness-continuation-retry");

export interface PendingContinuationWrite {
  expectedRevision: number | null;
  manifest: ContinuationManifest;
  artifacts: ContinuationArtifact[];
}

export type QueueEncryption = (plaintext: string) => Promise<Extract<ArtifactContent, { privacy: "encrypted" }>>;
export type QueueDecryption = (content: ArtifactContent) => Promise<string>;

type QueueEnvelope =
  | { formatVersion: 1; expiresAt: number | null; kind: "commit"; write: PendingContinuationWrite }
  | { formatVersion: 1; expiresAt: null; kind: "save"; intent: ContinuationSaveIntent }
  | { formatVersion: 1; expiresAt: null; kind: "projects-local"; keyMaterial: string; projection: string; expectedRevision?: number | null };

async function ensurePrivateDirectory(directory: string): Promise<void> {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const details = await lstat(directory);
  if (!details.isDirectory() || details.isSymbolicLink()) throw new Error("continuation retry queue must be a real directory");
  await chmod(directory, 0o700);
}

export class EncryptedContinuationRetryQueue {
  constructor(
    private readonly encrypt: QueueEncryption,
    private readonly decrypt: QueueDecryption,
    private readonly directory = defaultQueueDirectory,
  ) {}

  async enqueue(write: PendingContinuationWrite): Promise<string> {
    await ensurePrivateDirectory(this.directory);
    return this.writeEnvelope({ formatVersion: 1, expiresAt: null, kind: "commit", write }, this.directory);
  }

  async enqueueIntent(intent: ContinuationSaveIntent, now = Date.now()): Promise<string> {
    await ensurePrivateDirectory(this.directory);
    return this.writeEnvelope({ formatVersion: 1, expiresAt: null, kind: "save", intent }, this.directory);
  }

  async enqueueProjectsLocal(keyMaterial: Uint8Array, projection: string, expectedRevision?: number | null): Promise<string> {
    await ensurePrivateDirectory(this.directory);
    return this.writeEnvelope({
      formatVersion: 1,
      expiresAt: null,
      kind: "projects-local",
      keyMaterial: Buffer.from(keyMaterial).toString("base64"),
      projection,
      ...(expectedRevision === undefined ? {} : { expectedRevision }),
    }, this.directory);
  }

  private async writeEnvelope(envelope: QueueEnvelope, directory: string): Promise<string> {
    const encrypted = await this.encrypt(JSON.stringify(envelope));
    if (!encrypted.ciphertext.startsWith("-----BEGIN AGE ENCRYPTED FILE-----")) throw new Error("retry queue encryption did not produce age ciphertext");
    for (let attempt = 0; attempt < 100; attempt += 1) {
      // ponytail: scan the small local queue; use a locked counter if backlog size makes this slow.
      const names = await readdir(directory);
      const legacyCount = names.filter((name) => /^[0-9a-f-]{36}\.age$/.test(name)).length;
      const sequences = names.flatMap((name) => {
        const match = /^(\d{20})\.age$/.exec(name);
        return match ? [BigInt(match[1]!)] : [];
      });
      const lastSequence = sequences.reduce((last, current) => current > last ? current : last, BigInt(legacyCount));
      const name = `${(lastSequence + 1n).toString().padStart(20, "0")}.age`;
      const path = join(directory, name);
      try {
        await writeFile(path, encrypted.ciphertext, { encoding: "utf8", flag: "wx", mode: 0o600 });
        return path;
      } catch (error) {
        if (!(error instanceof Error) || !("code" in error) || error.code !== "EEXIST") throw error;
      }
    }
    throw new Error("could not allocate a continuation retry queue order");
  }

  async flush(
    store: ContinuationStore,
    now = Date.now(),
    encryptSensitive?: (plaintext: string) => Promise<Extract<ArtifactContent, { privacy: "encrypted" }>>,
    options: { rebaseUnbasedSaves?: boolean } = {},
    projectRecordStore?: ContinuationUserRecordStore,
  ): Promise<{ committed: number; expired: number }> {
    await ensurePrivateDirectory(this.directory);
    let committed = 0;
    const expired = 0;
    const entries: Array<{ name: string; path: string; mtime: number; envelope: QueueEnvelope }> = [];
    for (const name of (await readdir(this.directory)).filter((entry) => /^(?:[0-9a-f-]{36}|\d{20})\.age$/.test(entry))) {
      const path = join(this.directory, name);
      const details = await lstat(path);
      if (!details.isFile() || details.isSymbolicLink() || details.size > maxQueueEntryBytes) throw new Error("invalid continuation retry queue entry");
      const ciphertext = await readFile(path, "utf8");
      const plaintext = await this.decrypt({ privacy: "encrypted", ciphertext });
      const envelope = parseQueueEnvelope(plaintext);
      entries.push({ name, path, mtime: details.mtimeMs, envelope });
    }
    entries.sort((left, right) => {
      const leftSequence = /^(\d{20})\.age$/.exec(left.name)?.[1];
      const rightSequence = /^(\d{20})\.age$/.exec(right.name)?.[1];
      if (leftSequence && rightSequence) return BigInt(leftSequence) < BigInt(rightSequence) ? -1 : BigInt(leftSequence) > BigInt(rightSequence) ? 1 : left.name.localeCompare(right.name);
      if (leftSequence) return 1;
      if (rightSequence) return -1;
      return left.mtime - right.mtime || left.name.localeCompare(right.name);
    });
    for (const { path, envelope } of entries) {
      if (envelope.kind === "commit") await this.flushCommit(store, envelope.write);
      else if (envelope.kind === "save") {
        if (!encryptSensitive) throw new Error("sensitive artifact encryption is required to replay queued saves");
        await this.flushSave(store, envelope.intent, now, encryptSensitive, options.rebaseUnbasedSaves ?? false);
      } else {
        if (!projectRecordStore || !encryptSensitive) throw new Error("project record store and encryption are required to replay queued project metadata");
        const keyMaterial = Buffer.from(envelope.keyMaterial, "base64");
        if (keyMaterial.length < 32) throw new Error("invalid queued projects.local record");
        const key = projectsLocalRecordKey(keyMaterial);
        const current = await projectRecordStore.loadUserRecord(key);
        const currentRevision = current?.revision ?? null;
        const revisionConflict = (envelope.expectedRevision === undefined && currentRevision !== null)
          || (envelope.expectedRevision !== undefined && envelope.expectedRevision !== currentRevision);
        if (revisionConflict && !options.rebaseUnbasedSaves) {
          throw new ContinuationRevisionConflictError();
        }
        const projection = revisionConflict && current
          ? mergeProjectsLocal(await this.decrypt(current.content), envelope.projection)
          : envelope.projection;
        await commitProjectsLocalProjection(projectRecordStore, keyMaterial, projection, encryptSensitive, currentRevision);
      }
      await rm(path);
      committed += 1;
    }
    return { committed, expired };
  }

  private async flushCommit(store: ContinuationStore, write: PendingContinuationWrite): Promise<void> {
    try {
      await store.commit(write.expectedRevision, write.manifest, write.artifacts);
    } catch (error) {
      if (!(error instanceof ContinuationRevisionConflictError)) throw error;
      const current = await store.load(write.manifest.key);
      const operationId = write.manifest.events.at(-1)?.operationId;
      if (!current || !operationId || current.revision !== write.manifest.revision
          || JSON.stringify(current.latest) !== JSON.stringify(write.manifest.latest)
          || !current.events.some((event) => event.operationId === operationId)) throw error;
    }
  }

  private async flushSave(
    store: ContinuationStore,
    intent: ContinuationSaveIntent,
    now: number,
    encryptSensitive: (plaintext: string) => Promise<Extract<ArtifactContent, { privacy: "encrypted" }>>,
    rebaseUnbasedSaves: boolean,
  ): Promise<void> {
    const keyMaterial = Buffer.from(intent.keyMaterial, "base64");
    if (keyMaterial.length < 32 || !/^sessions\/[0-9a-f]{64}$/.test(intent.session) || !intent.operationId.trim()) throw new Error("invalid queued continuation save");
    const session = intent.session;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      let current = await store.load(session);
      if (current?.events.some((event) => event.operationId === intent.operationId)) return;
      if (current?.state === "in-progress" && current.lease && current.lease.expiresAt <= now) {
        if (!rebaseUnbasedSaves) throw new ContinuationRevisionConflictError();
        const takeoverOwner = randomUUID();
        const takeover = claim(current, takeoverOwner, now, 60 * 60 * 1000);
        try {
          await store.commit(current.revision, takeover, []);
        } catch (error) {
          if (!(error instanceof ContinuationRevisionConflictError) || attempt === 2) throw error;
          continue;
        }
        intent.owner = takeoverOwner;
        intent.expectedRevision = takeover.revision;
        current = takeover;
      }
      const owner = intent.owner ? createHash("sha256").update(intent.owner).digest("hex") : null;
      const ownedClaim = current?.state === "in-progress" && current.lease?.owner === owner;
      if (intent.expectedRevision === undefined && current) {
        const explicitlyRebasedActiveSession = rebaseUnbasedSaves && current.state === "active";
        if (!ownedClaim && !explicitlyRebasedActiveSession) throw new ContinuationRevisionConflictError();
      }
      if (intent.expectedRevision !== undefined && (current?.revision ?? null) !== intent.expectedRevision) {
        if (!current || !rebaseUnbasedSaves || (current.state !== "active" && !ownedClaim)) throw new ContinuationRevisionConflictError();
        intent.expectedRevision = current.revision;
      }
      if (intent.expectedRevision === undefined) intent.expectedRevision = current?.revision ?? null;
      const inputs = await Promise.all(intent.artifacts.map(async ({ id, kind, content }) => {
        assertSafeContinuationArtifact(content.plaintext);
        return {
          key: artifactKey(keyMaterial, session, kind, id),
          kind,
          content: await encryptSensitive(content.plaintext),
        };
      }));
      const prepared = save(session, current, intent.owner, now, inputs, intent.operationId, true);
      try {
        await store.commit(current?.revision ?? null, prepared.manifest, prepared.artifacts);
        return;
      } catch (error) {
        if (!(error instanceof ContinuationRevisionConflictError) || attempt === 2) throw error;
      }
    }
    throw new Error("queued continuation save could not be committed");
  }
}

function parseQueueEnvelope(source: string): QueueEnvelope {
  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch {
    throw new Error("invalid continuation retry queue entry");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid continuation retry queue entry");
  const value = parsed as Partial<QueueEnvelope>;
  if (value.formatVersion !== 1 || !(value.expiresAt === null || Number.isSafeInteger(value.expiresAt))) throw new Error("invalid continuation retry queue entry");
  if (value.kind === "commit") {
    const write = value.write;
    if (!write || !(write.expectedRevision === null || Number.isSafeInteger(write.expectedRevision))
        || !write.manifest || !Array.isArray(write.artifacts)
        || write.manifest.revision !== ((write.expectedRevision ?? 0) + 1)
        || write.artifacts.some((artifact) => artifact.key.split("/artifacts/")[0] !== write.manifest.key)) throw new Error("invalid continuation retry queue entry");
    return value as Extract<QueueEnvelope, { kind: "commit" }>;
  }
  if (value.kind === "save" && value.expiresAt === null && value.intent && typeof value.intent === "object"
      && typeof value.intent.operationId === "string" && typeof value.intent.keyMaterial === "string"
      && typeof value.intent.session === "string" && /^sessions\/[0-9a-f]{64}$/.test(value.intent.session)
      && (value.intent.expectedRevision === undefined || value.intent.expectedRevision === null || Number.isSafeInteger(value.intent.expectedRevision))
      && Array.isArray(value.intent.artifacts)) {
    return value as Extract<QueueEnvelope, { kind: "save" }>;
  }
  if (value.kind === "projects-local" && value.expiresAt === null && typeof value.keyMaterial === "string"
      && typeof value.projection === "string"
      && (value.expectedRevision === undefined || value.expectedRevision === null || Number.isSafeInteger(value.expectedRevision))) {
    return value as Extract<QueueEnvelope, { kind: "projects-local" }>;
  }
  throw new Error("invalid continuation retry queue entry");
}

export function continuationRetryQueueFromEnvironment(): EncryptedContinuationRetryQueue {
  const directory = defaultQueueDirectory;
  const identity = process.env.HARNESS_SECURE_AGE_IDENTITY;
  const recipients = process.env.HARNESS_SECURE_AGE_RECIPIENTS?.split(",").map((recipient) => recipient.trim()).filter(Boolean);
  if (!identity || !recipients || recipients.length < 2) throw new Error("secure age identity and dual recipients are required for continuation retry queue");
  return new EncryptedContinuationRetryQueue(
    async (plaintext) => {
      const { encryptContinuationArtifact } = await import("./continuation-crypto.js");
      return encryptContinuationArtifact(plaintext, recipients);
    },
    async (content) => {
      const { decryptContinuationArtifact } = await import("./continuation-crypto.js");
      return decryptContinuationArtifact(content, identity);
    },
    directory,
  );
}
