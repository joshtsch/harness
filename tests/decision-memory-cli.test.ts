import { execFile } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";

const exec = promisify(execFile);
const repoRoot = resolve(import.meta.dirname, "..");
const tsx = createRequire(import.meta.url).resolve("tsx");
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "harness-decision-memory-cli-"));
  roots.push(root);
  const home = join(root, "home");
  const input = join(root, "preference.json");
  await mkdir(home);
  await writeFile(input, JSON.stringify({
    id: "worktree-root",
    category: "worktree-location",
    scope: { user: "local", project: "harness" },
    preference: "~/worktrees",
    confidence: 1,
    provenance: { authority: "user-confirmed", confirmedAt: "2026-10-10T00:00:00.000Z", source: "explicit-user-confirmation" },
    reviewAfter: "2027-10-10T00:00:00.000Z",
  }));
  const run = (args: string[]) => exec(process.execPath, ["--import", tsx, resolve(repoRoot, "scripts/decision-memory.ts"), ...args], {
    cwd: repoRoot,
    env: { ...process.env, HOME: home },
  });
  return { home, input, run };
}

describe.skipIf(process.platform === "win32")("decision-memory CLI", () => {
  it("retrieves a scoped user preference after explicit recording confirmation", async () => {
    const { home, input, run } = await fixture();
    await expect(run(["get", "--category", "worktree-location", "--project", "harness"]))
      .resolves.toMatchObject({ stdout: expect.stringContaining('"status": "not-found"') });
    await expect(run(["record", "--input", input])).rejects.toMatchObject({ code: 1 });
    await run(["record", "--input", input, "--confirm"]);

    const result = await run(["get", "--category", "worktree-location", "--project", "harness"]);
    expect(JSON.parse(result.stdout)).toMatchObject({ status: "available", preference: { id: "worktree-root", preference: "~/worktrees" } });
    const persisted = await readFile(join(home, ".local/state/harness/decision-memory.json"), "utf8");
    expect(JSON.parse(persisted).records).toHaveLength(1);
  });

  it("returns only records matching the requested category", async () => {
    const { run, input } = await fixture();
    await run(["record", "--input", input, "--confirm"]);
    const result = await run(["list", "--category", "deployment"]);
    expect(JSON.parse(result.stdout)).toEqual([]);
  });
});
