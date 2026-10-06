import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { initializeAgeIdentity } from "../src/secure-setup.js";
import { runRecoveryDrill } from "../src/recovery-drill.js";

describe("recovery drill", () => {
  it("decrypts a disposable record with both identities", async () => {
    const directory = await mkdtemp(join(tmpdir(), "harness-recovery-test-"));
    try {
      const primary = await initializeAgeIdentity(join(directory, "primary.txt"), "/repo/harness");
      const recovery = await initializeAgeIdentity(join(directory, "recovery.txt"), "/repo/harness");
      await runRecoveryDrill(
        { role: "primary", recipient: primary.recipient, identity: await readFile(primary.identityPath, "utf8") },
        { role: "recovery", recipient: recovery.recipient, identity: await readFile(recovery.identityPath, "utf8") },
      );
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("rejects a shared recipient", async () => {
    await expect(runRecoveryDrill(
      { role: "primary", recipient: "age1same", identity: "secret" },
      { role: "recovery", recipient: "age1same", identity: "secret" },
    )).rejects.toThrow("distinct");
  });
});
