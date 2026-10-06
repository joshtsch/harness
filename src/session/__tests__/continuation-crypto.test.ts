import { describe, expect, it } from "vitest";
import { decryptContinuationArtifact, encryptContinuationArtifact } from "../continuation-crypto.js";

const armored = "-----BEGIN AGE ENCRYPTED FILE-----\nexample\n-----END AGE ENCRYPTED FILE-----\n";

describe("continuation artifact encryption", () => {
  it("requires primary and recovery recipients and stores only armored ciphertext", async () => {
    const calls: Array<{ args: string[]; input: string }> = [];
    const content = await encryptContinuationArtifact("private handoff", ["age1primary", "age1recovery"], async (args, input) => {
      calls.push({ args, input });
      return armored;
    });
    expect(calls).toEqual([{ args: ["-a", "-r", "age1primary", "-r", "age1recovery"], input: "private handoff" }]);
    expect(content).toEqual({ privacy: "encrypted", ciphertext: armored });
    expect(JSON.stringify(content)).not.toContain("private handoff");
    await expect(encryptContinuationArtifact("private handoff", ["age1primary"], async () => armored)).rejects.toThrow("primary and recovery");
  });

  it("decrypts ciphertext only through the configured identity path", async () => {
    const calls: Array<{ args: string[]; input: string }> = [];
    const plaintext = await decryptContinuationArtifact({ privacy: "encrypted", ciphertext: armored }, "/private/age-identity", async (args, input) => {
      calls.push({ args, input });
      return "private handoff";
    });
    expect(plaintext).toBe("private handoff");
    expect(calls).toEqual([{ args: ["-d", "-i", "/private/age-identity"], input: armored }]);
  });

  it("rejects malformed encrypted content and empty inputs", async () => {
    await expect(decryptContinuationArtifact({ privacy: "encrypted", ciphertext: "not ciphertext" }, "/unused")).rejects.toThrow("malformed");
    await expect(encryptContinuationArtifact("  ", ["age1primary", "age1recovery"])).rejects.toThrow("cannot be empty");
  });
});
