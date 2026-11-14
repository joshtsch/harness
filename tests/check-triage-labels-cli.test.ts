import { execFile } from "node:child_process";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const exec = promisify(execFile);
const repoRoot = resolve(import.meta.dirname, "..");

describe("check:triage CLI", () => {
  it("counts sub-issues in the repository gh issue list used, not the cwd's", async () => {
    const bin = await mkdtemp(join(tmpdir(), "harness-check-triage-"));
    try {
      // Fake gh: the epic only has sub-issues when queried through gh's {owner}/{repo} placeholder.
      await writeFile(join(bin, "gh"), `#!/usr/bin/env node
const args = process.argv.slice(2);
if (args[0] === "issue") {
  console.log(JSON.stringify([{ number: 25, title: "Epic", body: "", labels: [{ name: "enhancement" }, { name: "epic" }, { name: "ready-for-planning" }] }]));
} else if (args[0] === "api") {
  console.log(args[1] === "repos/{owner}/{repo}/issues/25/sub_issues" ? "3" : "0");
} else {
  process.exit(1);
}
`);
      await chmod(join(bin, "gh"), 0o755);
      const result = await exec(process.execPath, [
        "--import", createRequire(import.meta.url).resolve("tsx"),
        resolve(repoRoot, "scripts/check-triage-labels.ts"),
      ], { cwd: repoRoot, env: { ...process.env, PATH: `${bin}:${process.env.PATH ?? ""}` } });
      expect(result.stdout).toContain("Triage labels pass for 1 open issue.");
    } finally {
      await rm(bin, { recursive: true, force: true });
    }
  });
});
