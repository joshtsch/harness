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
  return { root, home, input, run };
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

  it("reports a deviation as documented only when the absolute project record verifies", async () => {
    const { root, input, run } = await fixture();
    await run(["record", "--input", input, "--confirm"]);
    const projectRoot = join(root, "project");
    await mkdir(projectRoot);
    const recordPath = join(projectRoot, "project-decision.md");
    await writeFile(recordPath, [
      "- Category: worktree-location",
      "- Scope: user=local; project=harness",
      "- Preferred pattern: ~/worktrees",
      "- Actual pattern: /project-worktrees",
      "- Reason: The harness checkout runs on a constrained volume.",
      "- Date: October 10, 2026",
      "- Deciding authority: User",
      "- Configuration reference: HARNESS_WORKTREE_ROOT in local setup",
    ].join("\n"));

    const args = ["get", "--category", "worktree-location", "--project", "harness", "--project-actual", "/project-worktrees"];
    const verified = await run([...args, "--project-root", projectRoot, "--decision-record", recordPath]);
    expect(JSON.parse(verified.stdout).deviation).toMatchObject({ status: "documented", decisionRecord: recordPath });

    const unverified = await run([...args, "--project-root", projectRoot, "--decision-record", join(projectRoot, "missing.md")]);
    expect(JSON.parse(unverified.stdout).deviation).toMatchObject({ status: "undocumented", actual: "/project-worktrees" });

    await writeFile(recordPath, [
      "- Category: worktree-location",
      "- Scope: user=local; project=another-project",
      "- Preferred pattern: ~/worktrees",
      "- Actual pattern: /project-worktrees",
      "- Reason: Another project needs a custom worktree root.",
      "- Date: October 10, 2026",
      "- Deciding authority: User",
      "- Configuration reference: HARNESS_WORKTREE_ROOT in local setup",
    ].join("\n"));
    const wrongProject = await run([...args, "--project-root", projectRoot, "--decision-record", recordPath]);
    expect(JSON.parse(wrongProject.stdout).deviation.status).toBe("undocumented");

    await writeFile(recordPath, [
      "- Category: worktree-location",
      "- Scope: user=local; project=harness",
      "- Preferred pattern: ~/another-worktrees",
      "- Actual pattern: /project-worktrees",
      "- Reason: This project needs a custom worktree root.",
      "- Date: October 10, 2026",
      "- Deciding authority: User",
      "- Configuration reference: HARNESS_WORKTREE_ROOT in local setup",
    ].join("\n"));
    const wrongPreference = await run([...args, "--project-root", projectRoot, "--decision-record", recordPath]);
    expect(JSON.parse(wrongPreference.stdout).deviation.status).toBe("undocumented");

    await writeFile(recordPath, [
      "- Category: worktree-location",
      "- Preferred pattern: ~/worktrees",
      "- Actual pattern: /project-worktrees",
      "- Reason: This project needs a custom worktree root.",
      "- Date: October 10, 2026",
      "- Deciding authority: User",
      "- Configuration reference: HARNESS_WORKTREE_ROOT in local setup",
    ].join("\n"));
    const missingScope = await run(["get", "--category", "worktree-location", "--project-root", projectRoot,
      "--project-actual", "/project-worktrees", "--decision-record", recordPath]);
    expect(JSON.parse(missingScope.stdout).deviation.status).not.toBe("documented");

    await writeFile(join(root, "outside-project.md"), [
      "- Category: worktree-location",
      "- Scope: user=local; project=harness",
      "- Preferred pattern: ~/worktrees",
      "- Actual pattern: /project-worktrees",
      "- Reason: This project needs a custom worktree root.",
      "- Date: October 10, 2026",
      "- Deciding authority: User",
      "- Configuration reference: HARNESS_WORKTREE_ROOT in local setup",
    ].join("\n"));
    const outsideProject = await run([...args, "--project-root", projectRoot, "--decision-record", join(root, "outside-project.md")]);
    expect(JSON.parse(outsideProject.stdout).deviation.status).toBe("undocumented");
  });
});
