import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const repoRoot = resolve(import.meta.dirname, "..");

describe("TypeScript package script launchers", () => {
  it("uses Node's tsx preload instead of the tsx CLI", async () => {
    const packageJson = JSON.parse(await readFile(resolve(repoRoot, "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };
    const tsxCliScripts = Object.entries(packageJson.scripts)
      .filter(([, command]) => /^tsx\s/.test(command));
    expect(tsxCliScripts).toEqual([]);

    const listCommand = packageJson.scripts["continuation:list"];
    expect(listCommand).toBe("node --import tsx scripts/continuation.ts list");
    const [runtime, preloadFlag, preload, entrypoint, ...arguments_] = listCommand.split(" ");
    expect([runtime, preloadFlag, preload, entrypoint]).toEqual([
      "node",
      "--import",
      "tsx",
      "scripts/continuation.ts",
    ]);

    await expect(execFileAsync(process.execPath, [
      preloadFlag,
      preload,
      entrypoint,
      ...arguments_,
      "--state",
      "unsupported",
    ], { cwd: repoRoot })).rejects.toMatchObject({
      stderr: expect.stringContaining("--state must be active, in-progress, or inactive"),
    });
  });
});
