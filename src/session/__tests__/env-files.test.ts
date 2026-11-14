import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ProjectDefinition, ProjectEnvFile } from "../../project-config.js";
import { copyProjectEnvFiles, formatEnvFileOutcome } from "../env-files.js";
import type { CommandRunner } from "../worktree.js";

const exec = promisify(execFile);
const env = { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" };
const run: CommandRunner = async (command, args) => {
  try {
    return { code: 0, ...await exec(command, args, { env }) };
  } catch (error: any) {
    return { code: typeof error.code === "number" ? error.code : 1, stdout: error.stdout ?? "", stderr: error.stderr ?? "" };
  }
};

const project = (envFiles: ProjectEnvFile[]): ProjectDefinition => ({
  name: "example-project",
  remote: "https://example.com/example-project.git",
  defaultBranch: "main",
  setupScript: "scripts/setup.sh",
  issueTracker: { type: "github" },
  envFiles,
  verification: [],
  workflows: [],
});

describe("copyProjectEnvFiles", () => {
  let root: string;
  let clonePath: string;
  let worktreePath: string;
  const options = (overwrite = false) => ({ clonePath, worktreePath, overwrite, run });

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "harness-env-files-"));
    clonePath = join(root, "clone");
    worktreePath = join(root, "worktree");
    await mkdir(clonePath);
    await mkdir(join(worktreePath, "supabase"), { recursive: true });
    await exec("git", ["init", "-q", worktreePath], { env });
    await writeFile(join(worktreePath, ".gitignore"), ".env\nsupabase/.env\n");
    await writeFile(join(clonePath, ".env"), "GOOGLE_CLIENT_ID=client-value\nGOOGLE_SECRET=\"secret value\"\nUNRELATED=other\n");
  });
  afterEach(async () => { await rm(root, { recursive: true, force: true }); });

  it("copies a whole file with owner-only permissions and reports no values", async () => {
    const outcomes = await copyProjectEnvFiles(project([{ source: ".env", destination: "supabase/.env" }]), options());

    expect(outcomes).toEqual([{ destination: "supabase/.env", status: "copied" }]);
    expect(await readFile(join(worktreePath, "supabase/.env"), "utf8")).toBe(await readFile(join(clonePath, ".env"), "utf8"));
    expect((await stat(join(worktreePath, "supabase/.env"))).mode & 0o777).toBe(0o600);
    expect(formatEnvFileOutcome("example-project", outcomes[0]!)).toBe("example-project env file supabase/.env: copied");
    expect(JSON.stringify(outcomes)).not.toMatch(/client-value|secret value/);
  });

  it("copies only the named variables", async () => {
    await copyProjectEnvFiles(project([{ source: ".env", destination: "supabase/.env", variables: ["GOOGLE_CLIENT_ID", "GOOGLE_SECRET"] }]), options());

    expect(await readFile(join(worktreePath, "supabase/.env"), "utf8")).toBe("GOOGLE_CLIENT_ID='client-value'\nGOOGLE_SECRET='secret value'\n");
  });

  it("skips a missing source or missing variables without writing", async () => {
    const outcomes = await copyProjectEnvFiles(project([
      { source: ".env.missing", destination: ".env" },
      { source: ".env", destination: "supabase/.env", variables: ["GOOGLE_CLIENT_ID", "ABSENT"] },
    ]), options());

    expect(outcomes).toEqual([
      { destination: ".env", status: "skipped", reason: "source .env.missing missing" },
      { destination: "supabase/.env", status: "skipped", reason: "source missing variables ABSENT" },
    ]);
    await expect(stat(join(worktreePath, ".env"))).rejects.toThrow();
    await expect(stat(join(worktreePath, "supabase/.env"))).rejects.toThrow();
  });

  it("refuses a destination Git does not ignore", async () => {
    await expect(copyProjectEnvFiles(project([{ source: ".env", destination: "supabase/config.env" }]), options())).rejects.toThrow("supabase/config.env is not ignored by Git");
    await expect(stat(join(worktreePath, "supabase/config.env"))).rejects.toThrow();
  });

  it("keeps an existing destination unless overwrite is requested", async () => {
    await writeFile(join(worktreePath, "supabase/.env"), "KEEP=me\n");
    const entry = project([{ source: ".env", destination: "supabase/.env", variables: ["GOOGLE_CLIENT_ID"] }]);

    expect(await copyProjectEnvFiles(entry, options())).toEqual([{ destination: "supabase/.env", status: "skipped", reason: "destination exists; pass --overwrite-env-files to replace it" }]);
    expect(await readFile(join(worktreePath, "supabase/.env"), "utf8")).toBe("KEEP=me\n");

    expect(await copyProjectEnvFiles(entry, options(true))).toEqual([{ destination: "supabase/.env", status: "copied" }]);
    expect(await readFile(join(worktreePath, "supabase/.env"), "utf8")).toBe("GOOGLE_CLIENT_ID='client-value'\n");
  });
});
