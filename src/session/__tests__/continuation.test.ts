import { describe, expect, it } from "vitest";
import { artifactKey, claim, close, loadCheckpoint, persistAudit, persistClaim, persistClose, persistRenew, persistResume, persistSave, renew, save, sessionKey, type ContinuationArtifact, type ContinuationManifest, type ContinuationStore, type ContinuationState } from "../continuation.js";

const keyMaterial = Buffer.alloc(32, 7);
const session = sessionKey(keyMaterial, "private issue title");
const handoff = artifactKey(keyMaterial, session, "handoff", "main");
const handoffInput = { key: handoff, kind: "handoff" as const, content: { privacy: "encrypted" as const, ciphertext: "encrypted-one" } };
const encryptForTest = async (plaintext: string) => ({ privacy: "encrypted" as const, ciphertext: `encrypted:${plaintext}` });

class MemoryStore implements ContinuationStore {
  manifest: ContinuationManifest | null = null;
  artifacts: ContinuationArtifact[] = [];

  async load(): Promise<ContinuationManifest | null> {
    return this.manifest ? structuredClone(this.manifest) : null;
  }

  async list(state: ContinuationState): Promise<ContinuationManifest[]> {
    return this.manifest?.state === state ? [structuredClone(this.manifest)] : [];
  }

  async readArtifact(key: string): Promise<ContinuationArtifact | null> {
    return structuredClone(this.artifacts.find((artifact) => artifact.key === key) ?? null);
  }

  async commit(expectedRevision: number | null, next: ContinuationManifest, artifacts: ContinuationArtifact[]): Promise<void> {
    if ((this.manifest?.revision ?? null) !== expectedRevision) throw new Error("revision conflict");
    this.manifest = structuredClone(next);
    this.artifacts.push(...structuredClone(artifacts));
  }
}

describe("portable continuation contract", () => {
  it("keeps arbitrary operation labels out of the unencrypted manifest", () => {
    expect(() => save(session, null, null, 1000, [handoffInput], "private operation label")).toThrow("operation id");
  });

  it("uses stable opaque keys and append-only artifact revisions", async () => {
    expect(session).toBe(sessionKey(keyMaterial, "private issue title"));
    expect(session).not.toContain("private");
    expect(session).not.toBe(sessionKey(Buffer.alloc(32, 8), "private issue title"));
    const store = new MemoryStore();
    const first = save(session, null, null, 1000, [handoffInput]);
    await store.commit(null, first.manifest, first.artifacts);
    const second = save(session, await store.load(), null, 2000, [{ key: handoff, kind: "handoff", content: { privacy: "encrypted", ciphertext: "encrypted-two" } }]);
    await store.commit(1, second.manifest, second.artifacts);
    expect(store.manifest?.revision).toBe(2);
    expect(store.manifest?.latest[handoff]).toBe(2);
    expect(store.artifacts.map((artifact) => artifact.key)).toEqual([`${handoff}/revisions/1`, `${handoff}/revisions/2`]);
  });

  it("claims, renews, takes over expired leases, and releases on save", async () => {
    const initial = save(session, null, null, 1000, [handoffInput]);
    const claimed = claim(initial.manifest, "machine-a", 2000, 1000);
    expect(claimed.state).toBe("in-progress");
    expect(claimed.lease?.owner).toMatch(/^[0-9a-f]{64}$/);
    expect(claimed.lease?.owner).not.toContain("machine-a");
    expect(() => claim(initial.manifest, "machine-a", 2000, 60 * 60 * 1000 + 1)).toThrow("invalid claim");
    expect(() => claim(claimed, "machine-b", 2500, 1000)).toThrow("already claimed");
    const extended = renew(claimed, "machine-a", 2500, 1000);
    expect(() => save(session, extended, "machine-a", 3500, [])).toThrow("live claim");
    const takenOver = claim(extended, "machine-b", 3500, 1000);
    expect(takenOver.events.at(-1)?.type).toBe("taken-over");
    expect(() => save(session, takenOver, "machine-a", 3600, [])).toThrow("live claim");
    const released = save(session, takenOver, "machine-b", 3600, []);
    expect(released.manifest.state).toBe("active");
    expect(released.manifest.lease).toBeUndefined();
    const inactive = close(released.manifest, null, 3700, "superseded");
    expect(inactive.state).toBe("inactive");
    expect(() => claim(inactive, "machine-c", 3800, 1000)).toThrow("inactive");
    expect(() => save(session, inactive, null, 3800, [])).toThrow("immutable");
  });

  it("rejects stale commits without replacing durable state", async () => {
    const store = new MemoryStore();
    const first = save(session, null, null, 1000, [handoffInput]);
    await store.commit(null, first.manifest, first.artifacts);
    const stale = await store.load();
    const accepted = claim(stale!, "machine-a", 2000, 1000);
    await store.commit(stale!.revision, accepted, []);
    const rejected = claim(stale!, "machine-b", 2000, 1000);
    await expect(store.commit(stale!.revision, rejected, [])).rejects.toThrow("revision conflict");
    expect(store.manifest?.lease?.owner).not.toBe("machine-a");
    expect(store.manifest?.events.at(-1)?.actor).toBe(store.manifest?.lease?.owner);
  });

  it("requires a handoff on first save", () => {
    expect(() => save(session, null, null, 1000, [])).toThrow("requires a handoff");
  });

  it("publishes only after commit and lets another provider resume the checkpoint", async () => {
    const failing: ContinuationStore = {
      load: async () => null,
      list: async () => [],
      readArtifact: async () => null,
      commit: async () => { throw new Error("remote unavailable"); },
    };
    const input = [{ id: "main", kind: "handoff" as const, content: { privacy: "sensitive" as const, plaintext: "encrypted" } }];
    await expect(persistSave(failing, keyMaterial, "private issue title", null, 1000, input, encryptForTest)).rejects.toThrow("remote unavailable");
    expect(await failing.load(session)).toBeNull();

    const store = new MemoryStore();
    await persistSave(store, keyMaterial, "private issue title", null, 1000, input, encryptForTest);
    const resumed = await persistResume(store, session, "gemini-session", 2000, 1000, async (artifacts) => {
      expect(artifacts).toHaveLength(1);
      expect(artifacts[0]?.ciphertext).toBe("encrypted:encrypted");
    });
    expect(resumed.manifest.state).toBe("in-progress");
    expect(resumed.artifacts[0]?.key).toBe(`${handoff}/revisions/1`);
    await expect(persistResume(store, session, "codex-session", 2500, 1000)).rejects.toThrow("already claimed");
  });

  it("persists lease renewal and resolution through the same revision gate", async () => {
    const store = new MemoryStore();
    await persistSave(store, keyMaterial, "private issue title", null, 1000, [{ id: "main", kind: "handoff", content: { privacy: "sensitive", plaintext: "handoff" } }], encryptForTest);
    await persistClaim(store, session, "codex-session", 2000, 1000);
    const renewed = await persistRenew(store, session, "codex-session", 2500, 1000);
    expect(renewed.lease?.expiresAt).toBe(3500);
    await expect(persistClose(store, session, "gemini-session", 2600, "resolved")).rejects.toThrow("live claim");
    const closed = await persistClose(store, session, "codex-session", 2600, "resolved");
    expect(closed.state).toBe("inactive");
    await expect(persistClaim(store, session, "gemini-session", 3600, 1000)).rejects.toThrow("inactive");
  });

  it("loads immutable checkpoint revisions and fails closed if one is missing", async () => {
    const store = new MemoryStore();
    await persistSave(store, keyMaterial, "private issue title", null, 1000, [{ id: "main", kind: "handoff", content: { privacy: "sensitive", plaintext: "first" } }], encryptForTest);
    await persistSave(store, keyMaterial, "private issue title", null, 2000, [{ id: "main", kind: "handoff", content: { privacy: "sensitive", plaintext: "second" } }], encryptForTest);
    const checkpoint = await loadCheckpoint(store, session);
    expect(checkpoint.artifacts).toEqual([expect.objectContaining({ key: `${handoff}/revisions/2`, ciphertext: "encrypted:second" })]);
    expect((await store.list("active")).map((manifest) => manifest.key)).toEqual([session]);
    store.artifacts.pop();
    await expect(loadCheckpoint(store, session)).rejects.toThrow("checkpoint artifact is unavailable");
  });

  it("returns the checkpoint only after claiming it with the expected revision", async () => {
    const store = new MemoryStore();
    await persistSave(store, keyMaterial, "private issue title", null, 1000, [{ id: "main", kind: "handoff", content: { privacy: "sensitive", plaintext: "handoff" } }], encryptForTest);
    const resumed = await persistResume(store, session, "gemini-session", 2000, 1000);
    expect(resumed.manifest.state).toBe("in-progress");
    expect(resumed.artifacts[0]?.key).toBe(`${handoff}/revisions/1`);
    await expect(persistResume(store, session, "codex-session", 2500, 1000)).rejects.toThrow("already claimed");
  });

  it("validates and decrypts artifacts before acquiring the resume claim", async () => {
    const store = new MemoryStore();
    await persistSave(store, keyMaterial, "private issue title", null, 1000, [{ id: "main", kind: "handoff", content: { privacy: "sensitive", plaintext: "handoff" } }], encryptForTest);
    await expect(persistResume(store, session, "codex", 2000, 1000, async () => {
      throw new Error("identity unavailable");
    })).rejects.toThrow("identity unavailable");
    expect((await store.load())?.state).toBe("active");
  });

  it("stores a session audit as an encrypted review-only evaluation artifact", async () => {
    const store = new MemoryStore();
    await persistSave(store, keyMaterial, "private issue title", null, 1000, [{ id: "main", kind: "handoff", content: { privacy: "sensitive", plaintext: "handoff" } }], encryptForTest);
    const audited = await persistAudit(store, keyMaterial, session, null, 2000, "Candidate: clarify save behavior", encryptForTest);
    const evaluationKey = artifactKey(keyMaterial, session, "evaluation", "session-audit");
    expect(audited.state).toBe("active");
    expect(audited.latest[evaluationKey]).toBe(1);
    expect(store.artifacts.at(-1)).toMatchObject({ key: `${evaluationKey}/revisions/1`, privacy: "encrypted" });
    await expect(persistAudit(store, keyMaterial, session, null, 3000, " ", encryptForTest)).rejects.toThrow("cannot be empty");
  });
});
