import { createHash, createHmac, randomUUID } from "node:crypto";
import { assertSafeContinuationArtifact } from "./continuation-content-policy.js";

export type ContinuationState = "active" | "in-progress" | "inactive";
export type ArtifactKind = "handoff" | "decisions" | "outputs" | "evaluation";
export type ArtifactContent = { privacy: "encrypted"; ciphertext: string };
export type ContinuationArtifactInput = { privacy: "sensitive"; plaintext: string };
const maxLeaseMs = 60 * 60 * 1000;
const operationIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface ContinuationSaveIntent {
  operationId: string;
  keyMaterial: string;
  session: string;
  owner: string | null;
  expectedRevision?: number | null;
  artifacts: Array<{ id: string; kind: ArtifactKind; content: ContinuationArtifactInput }>;
}

export type ContinuationArtifact = ArtifactContent & {
  key: string;
  kind: ArtifactKind;
  revision: number;
};

export interface ContinuationManifest {
  key: string;
  revision: number;
  state: ContinuationState;
  lease?: { owner: string; expiresAt: number };
  latest: Record<string, number>;
  events: Array<{ type: "saved" | "claimed" | "taken-over" | "renewed" | "resolved" | "superseded"; at: string; actor?: string; operationId?: string }>;
}

export interface ContinuationStore {
  load(key: string): Promise<ContinuationManifest | null>;
  list(state: ContinuationState): Promise<ContinuationManifest[]>;
  readArtifact(key: string): Promise<ContinuationArtifact | null>;
  commit(expectedRevision: number | null, manifest: ContinuationManifest, artifacts: ContinuationArtifact[]): Promise<void>;
}

export interface ContinuationUserRecordStore {
  loadUserRecord(key: string): Promise<{ revision: number; content: ArtifactContent } | null>;
  commitUserRecord(key: string, expectedRevision: number | null, content: ArtifactContent): Promise<number>;
}

export class ContinuationQueuedError extends Error {
  constructor(readonly sessionKey: string) {
    super("remote save is queued in encrypted temporary storage and is not resumable yet");
    this.name = "ContinuationQueuedError";
  }
}

function timestamp(now: number): string {
  if (!Number.isFinite(now) || Math.abs(now) > 8.64e15) throw new Error("invalid time");
  return new Date(now).toISOString();
}

function ownerDigest(owner: string): string {
  if (!owner.trim()) throw new Error("invalid lease owner");
  return createHash("sha256").update(owner).digest("hex");
}

function key(secret: Uint8Array, namespace: string, value: string): string {
  if (secret.length < 32) throw new Error("continuation key must be at least 32 bytes");
  if (!value.trim()) throw new Error(`${namespace} identity is required`);
  return createHmac("sha256", secret).update(`${namespace}\0${value}`).digest("hex");
}

export function sessionKey(secret: Uint8Array, sessionId: string): string {
  return `sessions/${key(secret, "session", sessionId)}`;
}

export function artifactKey(secret: Uint8Array, session: string, kind: ArtifactKind, id: string): string {
  return `${session}/artifacts/${kind}/${key(secret, `${session}:${kind}`, id)}`;
}

export function projectsLocalRecordKey(secret: Uint8Array): string {
  return `user-records/${key(secret, "user-record", "projects-local")}`;
}

export function claim(manifest: ContinuationManifest, owner: string, now: number, leaseMs: number): ContinuationManifest {
  const at = timestamp(now);
  if (!owner.trim() || !Number.isSafeInteger(leaseMs) || leaseMs <= 0 || leaseMs > maxLeaseMs) throw new Error("invalid claim");
  if (manifest.state === "inactive") throw new Error("inactive session cannot be claimed");
  const takeover = manifest.state === "in-progress";
  if (takeover && !manifest.lease) throw new Error("in-progress session has no lease");
  if (takeover && manifest.lease && manifest.lease.expiresAt > now) throw new Error("session is already claimed");
  const digest = ownerDigest(owner);
  return {
    ...manifest,
    revision: manifest.revision + 1,
    state: "in-progress",
    lease: { owner: digest, expiresAt: now + leaseMs },
    events: [...manifest.events, { type: takeover ? "taken-over" : "claimed", at, actor: digest }],
  };
}

export function renew(manifest: ContinuationManifest, owner: string, now: number, leaseMs: number): ContinuationManifest {
  const at = timestamp(now);
  if (!Number.isSafeInteger(leaseMs) || leaseMs <= 0 || leaseMs > maxLeaseMs) throw new Error("invalid lease duration");
  const digest = ownerDigest(owner);
  if (manifest.state !== "in-progress" || manifest.lease?.owner !== digest || manifest.lease.expiresAt <= now) throw new Error("no live claim to renew");
  return { ...manifest, revision: manifest.revision + 1, lease: { owner: digest, expiresAt: now + leaseMs }, events: [...manifest.events, { type: "renewed", at, actor: digest }] };
}

export function save(
  session: string,
  current: ContinuationManifest | null,
  owner: string | null,
  now: number,
  artifacts: Array<{ key: string; kind: ArtifactKind; content: ArtifactContent }>,
  operationId: string = randomUUID(),
  allowExpiredClaim = false,
): { manifest: ContinuationManifest; artifacts: ContinuationArtifact[] } {
  const at = timestamp(now);
  if (!operationIdPattern.test(operationId)) throw new Error("invalid continuation operation id");
  if (current && current.key !== session) throw new Error("session key mismatch");
  if (current?.state === "inactive") throw new Error("inactive session is immutable");
  if (!current && !artifacts.some((artifact) => artifact.kind === "handoff")) throw new Error("initial save requires a handoff");
  if (current?.state === "in-progress" && (current.lease?.owner !== (owner ? ownerDigest(owner) : null) || (!allowExpiredClaim && current.lease.expiresAt <= now))) throw new Error("save requires a live claim");
  if (new Set(artifacts.map((artifact) => artifact.key)).size !== artifacts.length) throw new Error("duplicate artifact key");
  const latest = { ...current?.latest };
  const revisions = artifacts.map(({ key: artifact, kind, content }) => {
    if (!artifact.startsWith(`${session}/artifacts/${kind}/`)) throw new Error("artifact key escapes session");
    const revision = (latest[artifact] ?? 0) + 1;
    latest[artifact] = revision;
    return { key: `${artifact}/revisions/${revision}`, kind, revision, ...content };
  });
  return {
    manifest: {
      key: session,
      revision: (current?.revision ?? 0) + 1,
      state: "active",
      latest,
      events: [...(current?.events ?? []), { type: "saved", at, operationId, ...(current?.state === "in-progress" ? { actor: ownerDigest(owner!) } : {}) }],
    },
    artifacts: revisions,
  };
}

export function close(manifest: ContinuationManifest, owner: string | null, now: number, reason: "resolved" | "superseded"): ContinuationManifest {
  const at = timestamp(now);
  if (manifest.state === "inactive") throw new Error("inactive session is immutable");
  if (manifest.state === "in-progress" && (manifest.lease?.owner !== (owner ? ownerDigest(owner) : null) || manifest.lease.expiresAt <= now)) throw new Error("close requires a live claim");
  const { lease: _lease, ...rest } = manifest;
  return { ...rest, revision: manifest.revision + 1, state: "inactive", events: [...manifest.events, { type: reason, at, ...(manifest.state === "in-progress" ? { actor: ownerDigest(owner!) } : {}) }] };
}

export async function persistSave(
  store: ContinuationStore,
  keyMaterial: Uint8Array,
  sessionId: string,
  owner: string | null,
  now: number,
  artifacts: Array<{ id: string; kind: ArtifactKind; content: ContinuationArtifactInput }>,
  encryptSensitive: (plaintext: string) => Promise<Extract<ArtifactContent, { privacy: "encrypted" }>>,
  options: {
    retryQueue?: {
      enqueueIntent(intent: ContinuationSaveIntent, now?: number): Promise<string>;
    };
    isRetryable?: (error: unknown) => boolean;
    operationId?: string;
  } = {},
): Promise<ContinuationManifest> {
  const session = sessionKey(keyMaterial, sessionId);
  return persistSaveToKey(store, keyMaterial, session, owner, now, artifacts, encryptSensitive, options);
}

export async function persistSaveToKey(
  store: ContinuationStore,
  keyMaterial: Uint8Array,
  session: string,
  owner: string | null,
  now: number,
  artifacts: Array<{ id: string; kind: ArtifactKind; content: ContinuationArtifactInput }>,
  encryptSensitive: (plaintext: string) => Promise<Extract<ArtifactContent, { privacy: "encrypted" }>>,
  options: {
    retryQueue?: {
      enqueueIntent(intent: ContinuationSaveIntent, now?: number): Promise<string>;
    };
    isRetryable?: (error: unknown) => boolean;
    operationId?: string;
  } = {},
): Promise<ContinuationManifest> {
  if (!/^sessions\/[0-9a-f]{64}$/.test(session)) throw new Error("invalid continuation session key");
  for (const artifact of artifacts) assertSafeContinuationArtifact(artifact.content.plaintext);
  const operationId = options.operationId ?? randomUUID();
  const intent: ContinuationSaveIntent = {
    operationId,
    keyMaterial: Buffer.from(keyMaterial).toString("base64"),
    session,
    owner,
    expectedRevision: undefined,
    artifacts,
  };
  let current: ContinuationManifest | null;
  try {
    current = await store.load(session);
  } catch (error) {
    if (!options.retryQueue || !options.isRetryable?.(error)) throw error;
    await options.retryQueue.enqueueIntent(intent, now);
    throw new ContinuationQueuedError(session);
  }
  intent.expectedRevision = current?.revision ?? null;
  if (current?.events.some((event) => event.operationId === operationId)) return current;
  const preparedInputs = await Promise.all(artifacts.map(async ({ id, kind, content }) => ({
    key: artifactKey(keyMaterial, session, kind, id),
    kind,
    content: await encryptSensitive(content.plaintext),
  })));
  const prepared = save(session, current, owner, now, preparedInputs, operationId);
  const expectedRevision = current?.revision ?? null;
  try {
    await store.commit(expectedRevision, prepared.manifest, prepared.artifacts);
  } catch (error) {
    if (!options.retryQueue || !options.isRetryable?.(error)) throw error;
    await options.retryQueue.enqueueIntent(intent, now);
    throw new ContinuationQueuedError(session);
  }
  return prepared.manifest;
}

export async function persistAudit(
  store: ContinuationStore,
  keyMaterial: Uint8Array,
  session: string,
  owner: string | null,
  now: number,
  report: string,
  encryptSensitive: (plaintext: string) => Promise<Extract<ArtifactContent, { privacy: "encrypted" }>>,
  options: { retryQueue?: { enqueueIntent(intent: ContinuationSaveIntent, now?: number): Promise<string> }; isRetryable?: (error: unknown) => boolean } = {},
): Promise<ContinuationManifest> {
  if (!report.trim()) throw new Error("session audit report cannot be empty");
  return persistSaveToKey(store, keyMaterial, session, owner, now, [{
    id: "session-audit",
    kind: "evaluation",
    content: { privacy: "sensitive", plaintext: report },
  }], encryptSensitive, options);
}

async function persistManifestUpdate(store: ContinuationStore, session: string, transform: (current: ContinuationManifest) => ContinuationManifest): Promise<ContinuationManifest> {
  const current = await store.load(session);
  if (!current) throw new Error("session is not available");
  const next = transform(current);
  await store.commit(current.revision, next, []);
  return next;
}

export async function persistClaim(store: ContinuationStore, session: string, owner: string, now: number, leaseMs: number): Promise<ContinuationManifest> {
  return persistManifestUpdate(store, session, (current) => claim(current, owner, now, leaseMs));
}

export async function persistRenew(store: ContinuationStore, session: string, owner: string, now: number, leaseMs: number): Promise<ContinuationManifest> {
  return persistManifestUpdate(store, session, (current) => renew(current, owner, now, leaseMs));
}

export async function persistClose(store: ContinuationStore, session: string, owner: string | null, now: number, reason: "resolved" | "superseded"): Promise<ContinuationManifest> {
  return persistManifestUpdate(store, session, (current) => close(current, owner, now, reason));
}

export async function loadCheckpoint(store: ContinuationStore, session: string): Promise<{ manifest: ContinuationManifest; artifacts: ContinuationArtifact[] }> {
  const manifest = await store.load(session);
  if (!manifest || manifest.key !== session) throw new Error("session is not available");
  const artifacts = await Promise.all(Object.entries(manifest.latest).map(async ([base, revision]) => {
    if (!base.startsWith(`${session}/artifacts/`) || !Number.isSafeInteger(revision) || revision <= 0) throw new Error("invalid checkpoint manifest");
    const key = `${base}/revisions/${revision}`;
    const artifact = await store.readArtifact(key);
    if (!artifact || artifact.key !== key || artifact.revision !== revision || !base.startsWith(`${session}/artifacts/${artifact.kind}/`)) throw new Error("checkpoint artifact is unavailable");
    return artifact;
  }));
  return { manifest, artifacts };
}

export async function persistResume(
  store: ContinuationStore,
  session: string,
  owner: string,
  now: number,
  leaseMs: number,
  validateArtifacts: (artifacts: ContinuationArtifact[]) => Promise<void> = async () => {},
): Promise<{ manifest: ContinuationManifest; artifacts: ContinuationArtifact[] }> {
  const checkpoint = await loadCheckpoint(store, session);
  await validateArtifacts(checkpoint.artifacts);
  const manifest = claim(checkpoint.manifest, owner, now, leaseMs);
  await store.commit(checkpoint.manifest.revision, manifest, []);
  return { manifest, artifacts: checkpoint.artifacts };
}
