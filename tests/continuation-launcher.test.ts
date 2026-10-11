import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const repoRoot = resolve(import.meta.dirname, "..");

describe("continuation list launcher", () => {
  it("uses Node's tsx preload and reaches the CLI without the tsx IPC server", async () => {
    const packageJson = JSON.parse(await readFile(resolve(repoRoot, "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };
    expect(packageJson.scripts["continuation:list"]).toBe("node --import tsx scripts/continuation.ts list");

    await expect(execFileAsync(process.execPath, [
      "--import",
      "tsx",
      "scripts/continuation.ts",
      "list",
      "--state",
      "unsupported",
    ], { cwd: repoRoot })).rejects.toMatchObject({
      stderr: expect.stringContaining("--state must be active, in-progress, or inactive"),
    });
  });
});
