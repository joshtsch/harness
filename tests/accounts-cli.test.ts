import { execFile } from "node:child_process";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const exec = promisify(execFile);
const script = resolve(import.meta.dirname, "../scripts/list-accounts.ts");
const tsx = createRequire(import.meta.url).resolve("tsx");

const publicConfig = "business_lines:\n  example-line:\n    display_name: Example\nprojects: {}\n";
const localConfig = "# keep me\nprovider_accounts:\n  mail:\n    plan: free\n    categories: [email]\n";

describe("pnpm accounts set", () => {
  let dir: string;
  const localPath = () => join(dir, "projects.local.yml");
  const run = async (...args: string[]) => {
    try {
      const { stdout, stderr } = await exec(process.execPath, ["--import", tsx, script, "set", ...args], { cwd: dir, env: { ...process.env, TMPDIR: join(dir, "tmp") } });
      return { code: 0, stdout, stderr };
    } catch (error) {
      const failure = error as { code: number; stdout: string; stderr: string };
      return { code: failure.code, stdout: failure.stdout, stderr: failure.stderr };
    }
  };

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "accounts-cli-"));
    await writeFile(join(dir, "projects.yml"), publicConfig);
    await writeFile(localPath(), localConfig);
    await exec("mkdir", [join(dir, "tmp")]);
  });
  afterEach(() => rm(dir, { recursive: true, force: true }));

  it("dry run prints the entry and leaves the file unchanged", async () => {
    const result = await run("storage", "--plan", "paid", "--categories", "object-storage");
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("Add provider account storage:");
    expect(result.stdout).toContain("Dry run");
    expect(await readFile(localPath(), "utf8")).toBe(localConfig);
  });

  it("writes with --skip-backup and keeps comments", async () => {
    const result = await run("mail", "--plan", "paid", "--business-line", "example-line", "--write", "--skip-backup");
    expect(result.code).toBe(0);
    const saved = await readFile(localPath(), "utf8");
    expect(saved).toContain("# keep me");
    expect(saved).toContain("business_line: example-line");
  });

  it("rejects an undeclared business line without writing or leaving temp files", async () => {
    const result = await run("mail", "--business-line", "nope", "--write", "--skip-backup");
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("unknown business line nope");
    expect(await readFile(localPath(), "utf8")).toBe(localConfig);
    expect((await readdir(join(dir, "tmp"))).filter((entry) => entry.startsWith("harness-accounts-"))).toEqual([]);
  });

  it("rejects empty category items", async () => {
    const result = await run("mail", "--categories", "email,");
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("without empty items");
  });

  it("does not print private values from another invalid entry", async () => {
    await writeFile(localPath(), `${localConfig}  mailer:\n    plan: free\n    categories: [email]\n    business_line: private-line-value\n`);
    const result = await run("mail", "--plan", "paid");
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("Unable to load the current configuration");
    expect(result.stderr).not.toContain("private-line-value");
  });
});
