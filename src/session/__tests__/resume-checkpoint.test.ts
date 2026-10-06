import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { ArtifactContent } from "../continuation.js";
import { readResumeCheckpoint, renewResumeCheckpoint, resumeProviderPayload, writeResumeCheckpoint, type ResumeCheckpoint } from "../resume-checkpoint.js";

const directories: string[] = [];
const marker = "-----BEGIN AGE ENCRYPTED FILE-----";
const encrypt = async (plaintext: string) => ({ privacy: "encrypted" as const, ciphertext: `${marker}\n${Buffer.from(plaintext).toString("base64")}\n-----END AGE ENCRYPTED FILE-----\n` });
const decrypt = async (content: ArtifactContent) => {
  if (content.privacy !== "encrypted") throw new Error("expected ciphertext");
  return Buffer.from(content.ciphertext.split("\n")[1]!, "base64").toString("utf8");
};

async function checkpointPath(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "resume-checkpoint-test-"));
  directories.push(directory);
  return join(directory, "checkpoint.json");
}

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("encrypted resume checkpoint files", () => {
  it("writes ciphertext, reads it, and re-encrypts on lease renewal", async () => {
    const path = await checkpointPath();
    const initial: ResumeCheckpoint = {
      sessionKey: `sessions/${"a".repeat(64)}`,
      owner: "private-owner-token",
      leaseExpiresAt: 1000,
      artifacts: [{ kind: "handoff", key: "opaque-artifact-key", revision: 2, content: "private handoff content" }],
    };

    await writeResumeCheckpoint(path, initial, encrypt);
    const stored = await readFile(path, "utf8");
    expect(stored.startsWith(marker)).toBe(true);
    expect(stored).not.toContain(initial.owner);
    expect(stored).not.toContain("private handoff content");
    expect((await stat(path)).mode & 0o777).toBe(0o600);
    await expect(readResumeCheckpoint(path, decrypt)).resolves.toEqual(initial);

    const renewed = { ...initial, leaseExpiresAt: 2000 };
    const renewCalls: Array<{ sessionKey: string; owner: string }> = [];
    const result = await renewResumeCheckpoint(path, decrypt, encrypt, async (sessionKey, owner) => {
      renewCalls.push({ sessionKey, owner });
      return renewed.leaseExpiresAt;
    });
    expect(result).toEqual({ sessionKey: initial.sessionKey, leaseExpiresAt: renewed.leaseExpiresAt });
    expect(renewCalls).toEqual([{ sessionKey: initial.sessionKey, owner: initial.owner }]);
    const renewedStored = await readFile(path, "utf8");
    expect(renewedStored.startsWith(marker)).toBe(true);
    expect(renewedStored).not.toContain(initial.owner);
    expect(await readResumeCheckpoint(path, decrypt)).toEqual(renewed);
    expect((await stat(path)).mode & 0o777).toBe(0o600);
  });

  it("rejects a plaintext checkpoint file", async () => {
    const path = await checkpointPath();
    await writeFile(path, JSON.stringify({ sessionKey: `sessions/${"a".repeat(64)}` }), { mode: 0o600 });
    await expect(readResumeCheckpoint(path, decrypt)).rejects.toThrow("checkpoint file is invalid");
  });

  it("returns decrypted artifacts to the active provider without exposing the owner token", () => {
    const checkpoint: ResumeCheckpoint = {
      sessionKey: `sessions/${"b".repeat(64)}`,
      owner: "private-owner-token",
      leaseExpiresAt: 3000,
      artifacts: [{ kind: "handoff", key: "opaque-artifact-key", revision: 1, content: "resume this work" }],
    };
    const payload = resumeProviderPayload(checkpoint.sessionKey, checkpoint.leaseExpiresAt, "/tmp/checkpoint.json", checkpoint.artifacts);
    expect(JSON.parse(payload)).toMatchObject({ status: "claimed", artifacts: checkpoint.artifacts });
    expect(payload).not.toContain(checkpoint.owner);
  });
});
