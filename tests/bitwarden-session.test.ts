import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveBitwardenSession, saveBitwardenSession } from "../src/bitwarden-session.js";

describe("Bitwarden sessions", () => {
  it("uses an explicitly supplied session without spawning unlock", async () => {
    const previous = process.env.HARNESS_BITWARDEN_SESSION;
    process.env.HARNESS_BITWARDEN_SESSION = "session-only-in-memory";
    await expect(resolveBitwardenSession()).resolves.toBe("session-only-in-memory");
    if (previous === undefined) delete process.env.HARNESS_BITWARDEN_SESSION;
    else process.env.HARNESS_BITWARDEN_SESSION = previous;
  });

  it("uses a protected session file without exposing its value", async () => {
    const root = await mkdtemp(join(tmpdir(), "bitwarden-session-"));
    const path = join(root, "session");
    const previous = process.env.HARNESS_BITWARDEN_SESSION_FILE;
    delete process.env.HARNESS_BITWARDEN_SESSION;
    delete process.env.BW_SESSION;
    process.env.HARNESS_BITWARDEN_SESSION_FILE = path;
    try {
      await saveBitwardenSession("session-from-file");
      await expect(resolveBitwardenSession()).resolves.toBe("session-from-file");
      expect(await readFile(path, "utf8")).toBe("session-from-file\n");
    } finally {
      if (previous === undefined) delete process.env.HARNESS_BITWARDEN_SESSION_FILE;
      else process.env.HARNESS_BITWARDEN_SESSION_FILE = previous;
      await rm(root, { recursive: true, force: true });
    }
  });
});
