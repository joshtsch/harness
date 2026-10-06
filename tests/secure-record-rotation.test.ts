import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { encryptSecureRecord, rotateSecureRecord, cleanupRotatedSecureRecord } from "../src/secure-records.js";
import { initializeAgeIdentity } from "../src/secure-setup.js";

describe("secure-record rotation", () => {
  it("keeps rollback ciphertext until explicit cleanup", async () => {
    const directory = await mkdtemp(join(tmpdir(), "harness-rotation-test-"));
    try {
      const old = await initializeAgeIdentity(join(directory, "old.txt"), "/repo/harness");
      const primary = await initializeAgeIdentity(join(directory, "primary.txt"), "/repo/harness");
      const recovery = await initializeAgeIdentity(join(directory, "recovery.txt"), "/repo/harness");
      const input = join(directory, "record.md");
      const root = join(directory, "records");
      await writeFile(input, "---\naccess:\n  harness: true\n---\nrecord\n");
      await encryptSecureRecord(root, "record", input, old.recipient);
      await rotateSecureRecord(root, "record", old.identityPath, [primary.recipient, recovery.recipient], [primary.identityPath, recovery.identityPath]);
      expect(await readFile(`${root}/record.md.age.previous`)).toBeTruthy();
      await cleanupRotatedSecureRecord(root, "record");
      await expect(readFile(`${root}/record.md.age.previous`)).rejects.toThrow();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
