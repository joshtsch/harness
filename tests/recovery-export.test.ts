import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { exportRecoveryIdentity, importRecoveryIdentity } from "../src/recovery-export.js";
import { initializeAgeIdentity } from "../src/secure-setup.js";

describe("recovery export", () => {
  it("round-trips an encrypted recovery identity without plaintext output", async () => {
    const directory = await mkdtemp(join(tmpdir(), "harness-export-test-"));
    try {
      const recovery = await initializeAgeIdentity(join(directory, "recovery.txt"), "/repo/harness");
      const recipient = await initializeAgeIdentity(join(directory, "export-recipient.txt"), "/repo/harness");
      const identity = { role: "recovery" as const, recipient: recovery.recipient, identity: await readFile(recovery.identityPath, "utf8") };
      const output = join(directory, "recovery.age");
      await exportRecoveryIdentity(identity, output, recipient.recipient);
      expect(await importRecoveryIdentity(output, recipient.identityPath)).toEqual(identity);
      expect(await readFile(output, "utf8")).not.toContain(identity.identity.trim());
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
