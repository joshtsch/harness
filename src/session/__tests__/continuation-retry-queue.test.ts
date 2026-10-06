import { mkdtemp, readdir, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { parse } from "yaml";
import { ContinuationQueuedError, persistClaim, persistSave, sessionKey, type ArtifactContent, type ContinuationArtifact, type ContinuationManifest, type ContinuationStore, type ContinuationState, type ContinuationUserRecordStore } from "../continuation.js";
import { EncryptedContinuationRetryQueue } from "../continuation-retry-queue.js";

const keyMaterial = Buffer.alloc(32, 17);
const session = sessionKey(keyMaterial, "retry-fixture");
const directories: string[] = [];
const armor = (value: string) => `-----BEGIN AGE ENCRYPTED FILE-----\n${Buffer.from(value).toString("base64")}\n-----END AGE ENCRYPTED FILE-----\n`;

class MemoryStore implements ContinuationStore, ContinuationUserRecordStore {
  manifest: ContinuationManifest | null = null;
  artifacts: ContinuationArtifact[] = [];
  userRecord: { revision: number; content: ArtifactContent } | null = null;

  async load(_key: string): Promise<ContinuationManifest | null> { return this.manifest ? structuredClone(this.manifest) : null; }
  async list(state: ContinuationState): Promise<ContinuationManifest[]> { return this.manifest?.state === state ? [structuredClone(this.manifest)] : []; }
  async readArtifact(key: string): Promise<ContinuationArtifact | null> { return structuredClone(this.artifacts.find((item) => item.key === key) ?? null); }
  async loadUserRecord(_key: string) { return structuredClone(this.userRecord); }
  async commitUserRecord(_key: string, expected: number | null, content: ArtifactContent): Promise<number> {
    if ((this.userRecord?.revision ?? null) !== expected) throw new Error("user record revision conflict");
    this.userRecord = { revision: (expected ?? 0) + 1, content: structuredClone(content) };
    return this.userRecord.revision;
  }
  async commit(expected: number | null, manifest: ContinuationManifest, artifacts: ContinuationArtifact[]): Promise<void> {
    if ((this.manifest?.revision ?? null) !== expected) throw new Error("revision conflict");
    this.manifest = structuredClone(manifest);
    this.artifacts.push(...structuredClone(artifacts));
  }
}

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function makeQueue() {
  const root = await mkdtemp(join(tmpdir(), "continuation-queue-test-"));
  directories.push(root);
  const directory = join(root, "retry");
  const encrypt = async (text: string) => ({ privacy: "encrypted" as const, ciphertext: armor(text) });
  const decrypt = async (content: ArtifactContent) => Buffer.from(content.ciphertext.split("\n")[1] ?? "", "base64").toString();
  return { directory, queue: new EncryptedContinuationRetryQueue(encrypt, decrypt, directory) };
}

describe("encrypted continuation retry queue", () => {
  it("keeps a failed save non-resumable until an encrypted retry commits", async () => {
    const store = new MemoryStore();
    const { directory, queue } = await makeQueue();
    const failing: ContinuationStore = {
      load: (key) => store.load(key),
      list: (state) => store.list(state),
      readArtifact: (key) => store.readArtifact(key),
      commit: async () => { throw new Error("offline"); },
    };
    const encrypt = async (plaintext: string) => ({ privacy: "encrypted" as const, ciphertext: armor(plaintext) });
    const input = [{ id: "handoff", kind: "handoff" as const, content: { privacy: "sensitive" as const, plaintext: "private recovery note" } }];
    await expect(persistSave(failing, keyMaterial, "retry-fixture", null, 1000, input, encrypt, {
      retryQueue: queue,
      isRetryable: (error) => error instanceof Error && error.message === "offline",
    })).rejects.toBeInstanceOf(ContinuationQueuedError);
    expect(await store.load(session)).toBeNull();
    const files = await readdir(directory);
    expect(files).toHaveLength(1);
    const encryptedFile = await readFile(join(directory, files[0]!), "utf8");
    expect(encryptedFile).not.toContain("private recovery note");
    expect((await stat(join(directory, files[0]!))).mode & 0o777).toBe(0o600);

    const result = await queue.flush(store, 2000, encrypt);
    expect(result).toEqual({ committed: 1, expired: 0 });
    expect((await store.load(session))?.state).toBe("active");
    expect(await readdir(directory)).toEqual([]);
  });

  it("keeps queued writes after one day", async () => {
    const { directory, queue } = await makeQueue();
    const manifest: ContinuationManifest = { key: session, revision: 1, state: "active", latest: {}, events: [{ type: "saved", at: new Date(1000).toISOString(), operationId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa" }] };
    await queue.enqueue({ expectedRevision: null, manifest, artifacts: [] });
    const result = await queue.flush(new MemoryStore(), 1000 + 24 * 60 * 60 * 1000 + 1);
    expect(result).toEqual({ committed: 1, expired: 0 });
    expect(await readdir(directory)).toEqual([]);
  });

  it("requires explicit takeover to flush a save after its lease expires", async () => {
    const store = new MemoryStore();
    const { directory, queue } = await makeQueue();
    const encrypt = async (plaintext: string) => ({ privacy: "encrypted" as const, ciphertext: armor(plaintext) });
    await persistSave(store, keyMaterial, "retry-fixture", null, 1000, [{ id: "handoff", kind: "handoff", content: { privacy: "sensitive", plaintext: "first save" } }], encrypt);
    await persistClaim(store, session, "machine-a", 2000, 60 * 60 * 1000);
    const offline: ContinuationStore = {
      load: (key) => store.load(key),
      list: (state) => store.list(state),
      readArtifact: (key) => store.readArtifact(key),
      commit: async () => { throw new Error("offline"); },
    };
    const input = [{ id: "handoff", kind: "handoff" as const, content: { privacy: "sensitive" as const, plaintext: "saved during outage" } }];
    await expect(persistSave(offline, keyMaterial, "retry-fixture", "machine-a", 3000, input, encrypt, {
      retryQueue: queue,
      isRetryable: (error) => error instanceof Error && error.message === "offline",
    })).rejects.toBeInstanceOf(ContinuationQueuedError);

    const later = 2000 + 24 * 60 * 60 * 1000;
    await expect(queue.flush(store, later, encrypt)).rejects.toThrow("revision conflict");
    expect(await readdir(directory)).toHaveLength(1);

    const result = await queue.flush(store, later, encrypt, { rebaseUnbasedSaves: true });
    expect(result).toEqual({ committed: 1, expired: 0 });
    const manifest = await store.load(session);
    expect(manifest?.state).toBe("active");
    expect(manifest?.events.at(-2)?.type).toBe("taken-over");
    expect(manifest?.events.at(-1)?.type).toBe("saved");
    const artifactBase = Object.keys(manifest!.latest)[0]!;
    const artifact = await store.readArtifact(`${artifactBase}/revisions/2`);
    expect(Buffer.from(artifact!.ciphertext.split("\n")[1]!, "base64").toString("utf8")).toBe("saved during outage");
    expect(await readdir(directory)).toEqual([]);
  });

  it("keeps unknown-revision queue entries when a session appeared during the outage", async () => {
    const store = new MemoryStore();
    const { directory, queue } = await makeQueue();
    const encrypt = async (plaintext: string) => ({ privacy: "encrypted" as const, ciphertext: armor(plaintext) });
    const offline: ContinuationStore = {
      load: async () => { throw new Error("offline"); },
      list: (state) => store.list(state),
      readArtifact: (key) => store.readArtifact(key),
      commit: async () => { throw new Error("offline"); },
    };
    const input = [{ id: "handoff", kind: "handoff" as const, content: { privacy: "sensitive" as const, plaintext: "queued unknown revision" } }];
    await expect(persistSave(offline, keyMaterial, "retry-fixture", null, 1000, input, encrypt, {
      retryQueue: queue,
      isRetryable: (error) => error instanceof Error && error.message === "offline",
    })).rejects.toBeInstanceOf(ContinuationQueuedError);
    await persistSave(store, keyMaterial, "retry-fixture", null, 2000, [{ ...input[0]!, content: { privacy: "sensitive", plaintext: "newer independent save" } }], encrypt);
    await expect(queue.flush(store, 3000, encrypt)).rejects.toThrow("revision conflict");
    expect(await readdir(directory)).toHaveLength(1);
  });

  it("requires an explicit rebase to flush an unknown-revision save onto an active session", async () => {
    const store = new MemoryStore();
    const { directory, queue } = await makeQueue();
    const encrypt = async (plaintext: string) => ({ privacy: "encrypted" as const, ciphertext: armor(plaintext) });
    await persistSave(store, keyMaterial, "retry-fixture", null, 1000, [
      { id: "handoff", kind: "handoff", content: { privacy: "sensitive", plaintext: "existing remote checkpoint" } },
    ], encrypt);

    const unavailable: ContinuationStore = {
      load: async () => { throw new Error("offline"); },
      list: (state) => store.list(state),
      readArtifact: (key) => store.readArtifact(key),
      commit: async () => { throw new Error("offline"); },
    };
    await expect(persistSave(unavailable, keyMaterial, "retry-fixture", null, 2000, [
      { id: "handoff", kind: "handoff", content: { privacy: "sensitive", plaintext: "queued offline checkpoint" } },
    ], encrypt, {
      retryQueue: queue,
      isRetryable: (error) => error instanceof Error && error.message === "offline",
    })).rejects.toBeInstanceOf(ContinuationQueuedError);

    await expect(queue.flush(store, 3000, encrypt)).rejects.toThrow("revision conflict");
    expect(await readdir(directory)).toHaveLength(1);
    const result = await queue.flush(store, 3000, encrypt, { rebaseUnbasedSaves: true });
    expect(result).toEqual({ committed: 1, expired: 0 });
    expect((await store.load(session))?.revision).toBe(2);
    expect(await readdir(directory)).toEqual([]);
  });

  it("explicitly rebases a queued save whose known revision is stale", async () => {
    const store = new MemoryStore();
    const { directory, queue } = await makeQueue();
    const encrypt = async (plaintext: string) => ({ privacy: "encrypted" as const, ciphertext: armor(plaintext) });
    const input = [{ id: "handoff", kind: "handoff" as const, content: { privacy: "sensitive" as const, plaintext: "offline stale revision" } }];
    await persistSave(store, keyMaterial, "retry-fixture", null, 1000, [
      { id: "handoff", kind: "handoff", content: { privacy: "sensitive", plaintext: "baseline" } },
    ], encrypt);
    const offline: ContinuationStore = {
      load: (key) => store.load(key),
      list: (state) => store.list(state),
      readArtifact: (key) => store.readArtifact(key),
      commit: async () => { throw new Error("offline"); },
    };
    await expect(persistSave(offline, keyMaterial, "retry-fixture", null, 2000, input, encrypt, {
      retryQueue: queue,
      isRetryable: (error) => error instanceof Error && error.message === "offline",
    })).rejects.toBeInstanceOf(ContinuationQueuedError);
    await persistSave(store, keyMaterial, "retry-fixture", null, 3000, [
      { id: "handoff", kind: "handoff", content: { privacy: "sensitive", plaintext: "independent newer save" } },
    ], encrypt);

    await expect(queue.flush(store, 4000, encrypt)).rejects.toThrow("revision conflict");
    expect(await readdir(directory)).toHaveLength(1);
    const result = await queue.flush(store, 4000, encrypt, { rebaseUnbasedSaves: true });
    expect(result).toEqual({ committed: 1, expired: 0 });
    const manifest = await store.load(session);
    expect(manifest?.revision).toBe(3);
    const artifactBase = Object.keys(manifest!.latest)[0]!;
    const artifact = await store.readArtifact(`${artifactBase}/revisions/3`);
    expect(Buffer.from(artifact!.ciphertext.split("\n")[1]!, "base64").toString("utf8")).toBe("offline stale revision");
  });

  it("rebases multiple queued saves in their original save order", async () => {
    const store = new MemoryStore();
    const { directory, queue } = await makeQueue();
    const encrypt = async (plaintext: string) => ({ privacy: "encrypted" as const, ciphertext: armor(plaintext) });
    await persistSave(store, keyMaterial, "retry-fixture", null, 1000, [
      { id: "handoff", kind: "handoff", content: { privacy: "sensitive", plaintext: "baseline checkpoint" } },
    ], encrypt);

    const unavailable: ContinuationStore = {
      load: async () => { throw new Error("offline"); },
      list: (state) => store.list(state),
      readArtifact: (key) => store.readArtifact(key),
      commit: async () => { throw new Error("offline"); },
    };
    const queueSave = (at: number, plaintext: string) => persistSave(unavailable, keyMaterial, "retry-fixture", null, at, [
      { id: "handoff", kind: "handoff", content: { privacy: "sensitive", plaintext } },
    ], encrypt, {
      retryQueue: queue,
      isRetryable: (error) => error instanceof Error && error.message === "offline",
    });
    await expect(queueSave(2000, "older offline checkpoint")).rejects.toBeInstanceOf(ContinuationQueuedError);
    await expect(queueSave(2000, "newer offline checkpoint")).rejects.toBeInstanceOf(ContinuationQueuedError);

    await expect(queue.flush(store, 4000, encrypt)).rejects.toThrow("revision conflict");
    expect(await readdir(directory)).toHaveLength(2);
    const result = await queue.flush(store, 4000, encrypt, { rebaseUnbasedSaves: true });
    expect(result).toEqual({ committed: 2, expired: 0 });
    const manifest = await store.load(session);
    expect(manifest?.revision).toBe(3);
    const artifactBase = Object.keys(manifest!.latest)[0]!;
    const artifact = await store.readArtifact(`${artifactBase}/revisions/3`);
    expect(Buffer.from(artifact!.ciphertext.split("\n")[1]!, "base64").toString("utf8")).toBe("newer offline checkpoint");
    expect(await readdir(directory)).toEqual([]);
  });

  it("keeps unavailable projects.local updates encrypted and flushes them remotely", async () => {
    const store = new MemoryStore();
    const { directory, queue } = await makeQueue();
    const projection = "projects:\n  app:\n    repository: example/app\n";
    await queue.enqueueProjectsLocal(keyMaterial, projection);
    const queued = await readFile(join(directory, (await readdir(directory))[0]!), "utf8");
    expect(queued).not.toContain("example/app");

    const result = await queue.flush(store, 2000, async (plaintext) => ({ privacy: "encrypted", ciphertext: armor(plaintext) }), {}, store);
    expect(result).toEqual({ committed: 1, expired: 0 });
    expect(store.userRecord?.revision).toBe(1);
    expect(Buffer.from(store.userRecord!.content.ciphertext.split("\n")[1]!, "base64").toString("utf8")).toBe(projection);
    expect(await readdir(directory)).toEqual([]);
  });

  it("preserves queued projects.local changes on remote revision conflict", async () => {
    const store = new MemoryStore();
    const remoteProjection = "projects:\n  app:\n    remote_field: preserved\n    default_branch: trunk\n  remote-only:\n    repository: org/remote\n";
    store.userRecord = { revision: 1, content: { privacy: "encrypted", ciphertext: armor(remoteProjection) } };
    const { directory, queue } = await makeQueue();
    const projection = "projects:\n  app:\n    repository: queued update\n    default_branch: main\n  queued-only:\n    repository: org/queued\n";
    await queue.enqueueProjectsLocal(keyMaterial, projection);
    const encrypt = async (plaintext: string) => ({ privacy: "encrypted" as const, ciphertext: armor(plaintext) });

    await expect(queue.flush(store, 2000, encrypt, {}, store)).rejects.toThrow("revision conflict");
    expect(store.userRecord?.revision).toBe(1);
    expect(Buffer.from(store.userRecord!.content.ciphertext.split("\n")[1]!, "base64").toString("utf8")).toBe(remoteProjection);
    expect(await readdir(directory)).toHaveLength(1);

    const result = await queue.flush(store, 2000, encrypt, { rebaseUnbasedSaves: true }, store);
    expect(result).toEqual({ committed: 1, expired: 0 });
    expect(store.userRecord?.revision).toBe(2);
    const rebased = parse(Buffer.from(store.userRecord!.content.ciphertext.split("\n")[1]!, "base64").toString("utf8"));
    expect(rebased.projects).toEqual({
      app: { remote_field: "preserved", default_branch: "trunk", repository: "queued update" },
      "remote-only": { repository: "org/remote" },
      "queued-only": { repository: "org/queued" },
    });
    expect(await readdir(directory)).toEqual([]);
  });

  it("allocates exclusive sequence numbers for concurrent queue writes", async () => {
    const { directory, queue } = await makeQueue();
    await Promise.all([
      queue.enqueueProjectsLocal(keyMaterial, "projects:\n  app:\n    repository: first\n"),
      queue.enqueueProjectsLocal(keyMaterial, "projects:\n  app:\n    repository: second\n"),
    ]);
    const sequencePrefix = "0".repeat(19);
    expect((await readdir(directory)).sort()).toEqual([`${sequencePrefix}1.age`, `${sequencePrefix}2.age`]);
  });
});
