import { randomUUID } from "node:crypto";
import { chmod, lstat, mkdtemp, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { ContinuationQueuedError, persistAudit, persistClose, persistResume, persistRenew, persistSaveToKey, projectsLocalRecordKey, sessionKey, type ArtifactKind, type ContinuationArtifactInput } from "../src/session/continuation.js";
import { continuationDecryptor, continuationEncryptor, continuationKeyFromEnvironment } from "../src/session/continuation-config.js";
import { continuationRetryQueueFromEnvironment } from "../src/session/continuation-retry-queue.js";
import { readResumeCheckpoint, renewResumeCheckpoint, resumeProviderPayload, writeResumeCheckpoint, type ResumeCheckpoint } from "../src/session/resume-checkpoint.js";
import { SupabaseContinuationStore, ContinuationBackendUnavailableError } from "../src/session/supabase-continuation-store.js";
import { commitProjectsLocalProjection, createProjectsLocalProjection, mergeProjectsLocal, readProjectsLocalRecord } from "../src/session/projects-local-projection.js";

const rawArgs = process.argv.slice(2);
if (rawArgs[0] === "--") rawArgs.shift();
let command = rawArgs.shift();
if (command === "save" && rawArgs[0] === "audit") {
  rawArgs.shift();
  command = "audit";
}

const args = rawArgs;
const leaseDurationMs = 60 * 60 * 1000;
function option(name: string): string | undefined {
  const index = args.indexOf(name);
  return index < 0 ? undefined : args[index + 1];
}

async function readInput(name: string): Promise<string> {
  const path = option(name);
  if (!path) throw new Error(`${name} is required`);
  try {
    return await readFile(resolve(path), "utf8");
  } catch {
    throw new Error(`unable to read continuation input for ${name}`);
  }
}

function handoffWithSessionKey(content: string, key: string): string {
  const marker = `<!-- harness-session-key: ${key} -->`;
  const withoutPreviousKey = content.replace(/^<!-- harness-session-key: sessions\/[0-9a-f]{64} -->\s*/m, "").trim();
  if (!withoutPreviousKey) throw new Error("handoff cannot be empty");
  return `${marker}\n\n${withoutPreviousKey}\n`;
}

async function writePrivateAtomic(path: string, content: string): Promise<void> {
  try {
    const existing = await lstat(path);
    if (!existing.isFile() || existing.isSymbolicLink()) throw new Error("output must be a regular file");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, content, { encoding: "utf8", flag: "wx", mode: 0o600 });
    await rename(temporary, path);
    await chmod(path, 0o600);
  } catch (error) {
    await unlink(temporary).catch(() => {});
    throw error;
  }
}

function serviceStore(): SupabaseContinuationStore {
  return new SupabaseContinuationStore({
    url: process.env.HARNESS_CONTINUATION_SUPABASE_URL ?? "",
    serviceKey: process.env.HARNESS_CONTINUATION_SUPABASE_SERVICE_ROLE_KEY ?? "",
  });
}

async function readCheckpoint(): Promise<{ path: string; value: ResumeCheckpoint } | null> {
  const supplied = option("--checkpoint-file");
  if (!supplied) return null;
  const path = resolve(supplied);
  return { path, value: await readResumeCheckpoint(path, continuationDecryptor()) };
}

async function saveProjectsLocal(
  source: string,
  keyMaterial: Buffer,
  queue: ReturnType<typeof continuationRetryQueueFromEnvironment>,
): Promise<{ revision?: number; queued: boolean }> {
  const projection = createProjectsLocalProjection(source, keyMaterial);
  const store = serviceStore();
  const recordKey = projectsLocalRecordKey(keyMaterial);
  let expectedRevision: number | null | undefined;
  try {
    const current = await store.loadUserRecord(recordKey);
    expectedRevision = current?.revision ?? null;
    const revision = await commitProjectsLocalProjection(store, keyMaterial, projection, continuationEncryptor(), expectedRevision);
    return { revision, queued: false };
  } catch (error) {
    if (!(error instanceof ContinuationBackendUnavailableError)) throw error;
    await queue.enqueueProjectsLocal(keyMaterial, projection, expectedRevision);
    return { queued: true };
  }
}

async function save(): Promise<void> {
  const keyMaterial = continuationKeyFromEnvironment();
  const encrypt = continuationEncryptor();
  const store = serviceStore();
  const queue = continuationRetryQueueFromEnvironment();
  const checkpoint = await readCheckpoint();
  const existingKey = option("--session-key");
  if (checkpoint && existingKey && existingKey !== checkpoint.value.sessionKey) throw new Error("session key does not match checkpoint file");
  const key = checkpoint?.value.sessionKey ?? existingKey ?? sessionKey(keyMaterial, randomUUID());
  const artifacts: Array<{ id: string; kind: ArtifactKind; content: ContinuationArtifactInput }> = [
    { id: "handoff", kind: "handoff", content: { privacy: "sensitive", plaintext: handoffWithSessionKey(await readInput("--handoff"), key) } },
  ];
  for (const [name, kind] of [["--decisions", "decisions"], ["--outputs", "outputs"]] as const) {
    if (option(name)) artifacts.push({ id: kind, kind, content: { privacy: "sensitive", plaintext: await readInput(name) } });
  }
  let projectConfigRevision: number | undefined;
  let projectConfigQueued = false;
  const projectsLocal = option("--projects-local");
  if (projectsLocal) {
    const result = await saveProjectsLocal(await readInput("--projects-local"), keyMaterial, queue);
    projectConfigRevision = result.revision;
    projectConfigQueued = result.queued;
  }
  const manifest = await persistSaveToKey(store, keyMaterial, key, checkpoint?.value.owner ?? null, Date.now(), artifacts, encrypt, {
    retryQueue: queue,
    isRetryable: (error) => error instanceof ContinuationBackendUnavailableError,
  });
  if (checkpoint) await unlink(checkpoint.path);
  console.log(JSON.stringify({ status: "saved", sessionKey: manifest.key, state: manifest.state, revision: manifest.revision, ...(projectConfigRevision === undefined ? {} : { projectConfigRevision }), ...(projectConfigQueued ? { projectConfigStatus: "queued" } : {}) }));
}

async function audit(): Promise<void> {
  const keyMaterial = continuationKeyFromEnvironment();
  const queue = continuationRetryQueueFromEnvironment();
  const checkpoint = await readCheckpoint();
  const session = checkpoint?.value.sessionKey ?? option("--session-key");
  if (!session) throw new Error("--session-key is required for save audit");
  const manifest = await persistAudit(serviceStore(), keyMaterial, session, checkpoint?.value.owner ?? null, Date.now(), await readInput("--report"), continuationEncryptor(), {
    retryQueue: queue,
    isRetryable: (error) => error instanceof ContinuationBackendUnavailableError,
  });
  if (checkpoint) await unlink(checkpoint.path);
  console.log(JSON.stringify({ status: "saved", type: "review-only-audit", sessionKey: manifest.key, revision: manifest.revision }));
}

async function resume(): Promise<void> {
  const session = option("--session-key");
  if (!session) throw new Error("--session-key is required");
  const owner = randomUUID();
  const decrypt = continuationDecryptor();
  let artifacts: Array<{ kind: ArtifactKind; key: string; revision: number; content: string }> = [];
  const result = await persistResume(serviceStore(), session, owner, Date.now(), leaseDurationMs, async (checkpoint) => {
    artifacts = await Promise.all(checkpoint.map(async (artifact) => ({
    kind: artifact.kind,
    key: artifact.key,
    revision: artifact.revision,
    content: await decrypt(artifact),
    })));
  });
  const directory = await mkdtemp(resolve(tmpdir(), "harness-resume-"));
  await chmod(directory, 0o700);
  const output = resolve(directory, "checkpoint.json");
  try {
    await writeResumeCheckpoint(output, { sessionKey: session, owner, leaseExpiresAt: result.manifest.lease?.expiresAt ?? 0, artifacts }, continuationEncryptor());
  } catch (error) {
    await persistSaveToKey(serviceStore(), continuationKeyFromEnvironment(), session, owner, Date.now(), [], continuationEncryptor());
    throw error;
  }
  console.log(resumeProviderPayload(session, result.manifest.lease?.expiresAt, output, artifacts));
}

async function renewLease(): Promise<void> {
  const path = option("--checkpoint-file");
  if (!path) throw new Error("--checkpoint-file is required to renew a session lease");
  const session = option("--session-key");
  const renewed = await renewResumeCheckpoint(resolve(path), continuationDecryptor(), continuationEncryptor(), async (sessionKey, owner) => {
    const manifest = await persistRenew(serviceStore(), sessionKey, owner, Date.now(), leaseDurationMs);
    return manifest.lease?.expiresAt ?? 0;
  }, session);
  console.log(JSON.stringify({ status: "renewed", sessionKey: renewed.sessionKey, leaseExpiresAt: renewed.leaseExpiresAt }));
}

async function list(): Promise<void> {
  const state = option("--state") ?? "active";
  if (state !== "active" && state !== "in-progress" && state !== "inactive") throw new Error("--state must be active, in-progress, or inactive");
  const manifests = await serviceStore().list(state);
  console.log(JSON.stringify(manifests.map((manifest) => ({
    sessionKey: manifest.key,
    state: manifest.state,
    revision: manifest.revision,
    artifactCount: Object.keys(manifest.latest).length,
    lastEvent: manifest.events.at(-1)?.type,
  })), null, 2));
}

async function close(): Promise<void> {
  const checkpoint = await readCheckpoint();
  const session = checkpoint?.value.sessionKey ?? option("--session-key");
  const reason = option("--reason");
  if (!session || (reason !== "resolved" && reason !== "superseded")) throw new Error("close requires --session-key and --reason resolved|superseded");
  const manifest = await persistClose(serviceStore(), session, checkpoint?.value.owner ?? null, Date.now(), reason);
  if (checkpoint) await unlink(checkpoint.path);
  console.log(JSON.stringify({ status: "inactive", sessionKey: session, reason, revision: manifest.revision }));
}

async function projectsPull(): Promise<void> {
  const keyMaterial = continuationKeyFromEnvironment();
  const output = option("--output");
  if (!output) throw new Error("--output is required to write the machine-local projects.local.yml overlay");
  const record = await readProjectsLocalRecord(serviceStore(), keyMaterial, continuationDecryptor());
  let local = "{}\n";
  try { local = await readFile(resolve(output), "utf8"); } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw new Error("unable to read local project overlay");
  }
  const content = mergeProjectsLocal(record.content, local);
  await writePrivateAtomic(resolve(output), content);
  console.log(JSON.stringify({ status: "hydrated", revision: record.revision }));
}

async function flush(): Promise<void> {
  if (args.some((arg) => arg !== "--rebase")) throw new Error("usage: pnpm continuation:flush [--rebase]");
  const store = serviceStore();
  const result = await continuationRetryQueueFromEnvironment().flush(store, Date.now(), continuationEncryptor(), {
    rebaseUnbasedSaves: args.includes("--rebase"),
  }, store);
  console.log(JSON.stringify({ status: "flushed", ...result }));
}

const actions: Record<string, () => Promise<void>> = { save, audit, resume, renew: renewLease, list, close, flush, projects: projectsPull };
try {
  const action = command ? actions[command] : undefined;
  if (!action) throw new Error("usage: pnpm save | pnpm resume | pnpm continuation:renew | pnpm continuation:list | pnpm continuation:close | pnpm continuation:flush | pnpm continuation:projects");
  await action();
} catch (error) {
  if (error instanceof ContinuationQueuedError) {
    console.log(JSON.stringify({ status: "queued", resumable: false, sessionKey: error.sessionKey, message: error.message }));
  } else {
    console.error(error instanceof Error ? error.message : "continuation operation failed");
    process.exitCode = 1;
  }
}
