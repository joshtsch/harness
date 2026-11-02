import { execFile } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtemp, readFile, readdir, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { stringify } from "yaml";
import { afterEach, describe, expect, it } from "vitest";
import { loadProjectsConfig } from "../src/project-config.js";
import { discoverConfiguredProjects } from "../src/project-inventory.js";

const directories: string[] = [];
const defaults = { default_branch: "main", setup_script: "scripts/setup.sh", issue_tracker: { type: "github" } };
const loader = createRequire(import.meta.url).resolve("tsx");
const script = resolve(import.meta.dirname, "../scripts/list-projects.ts");
const exec = promisify(execFile);

async function fixture(projects: Record<string, unknown> = {}) {
  const root = await realpath(await mkdtemp(resolve(tmpdir(), "project-inventory-")));
  directories.push(root);
  await writeFile(resolve(root, "projects.yml"), stringify({ defaults, projects }));
  return root;
}

afterEach(async () => {
  await Promise.all(directories.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("project discovery", () => {
  it("includes legacy projects without metadata or a wiki and supports an empty inventory", async () => {
    expect(await discoverConfiguredProjects(await fixture())).toEqual([]);
    const root = await fixture({ app: { remote: "https://example.invalid/app.git" } });
    expect(await discoverConfiguredProjects(root)).toEqual([{ name: "app", projectRoot: resolve(root, "projects/app") }]);
  });

  it("merges local routing metadata, replaces lists, and leaves files and missing checkouts untouched", async () => {
    const root = await fixture({ app: {
      remote: "https://example.invalid/app.git",
      purpose: "Manage schedules",
      topics: ["scheduling", "calendar"],
      excludes: ["billing"],
    } });
    const overlay = stringify({ projects: {
      app: { purpose: "Coordinate schedules", topics: ["appointments"], excludes: [] },
      notes: { remote: "https://example.invalid/notes.git", purpose: "Maintain knowledge" },
    } });
    await writeFile(resolve(root, "projects.local.yml"), overlay);
    const before = await readFile(resolve(root, "projects.yml"), "utf8");
    expect(await discoverConfiguredProjects(root)).toEqual([
      { name: "app", projectRoot: resolve(root, "projects/app"), purpose: "Coordinate schedules", topics: ["appointments"], excludes: [] },
      { name: "notes", projectRoot: resolve(root, "projects/notes"), purpose: "Maintain knowledge" },
    ]);
    expect(await readFile(resolve(root, "projects.yml"), "utf8")).toBe(before);
    expect(await readFile(resolve(root, "projects.local.yml"), "utf8")).toBe(overlay);
    expect((await readdir(root)).sort()).toEqual(["projects.local.yml", "projects.yml"]);
  });

  it("projects only discovery fields without resolving tool targets", async () => {
    const wiki = { description: "Scheduling reference", topics: ["time zones"], pages: "wiki", raw: "raw", templates: "templates" };
    const root = await fixture({ app: {
      remote: "https://example.invalid/identity-only.git",
      issue_tracker: { repository: "example/tracker-only" },
      purpose: "Manage schedules", topics: ["scheduling"], excludes: ["billing"], wiki,
      tool_mappings: { crm: { provider: "attio", targets: [{ id: "${HARNESS_DISCOVERY_UNSET_TARGET}", access: "read" }] } },
      workflows: [{ command: "must-not-run", args: [] }],
    } });
    const expected = [{ name: "app", projectRoot: resolve(root, "projects/app"), purpose: "Manage schedules", topics: ["scheduling"], excludes: ["billing"], wiki }];
    expect(await discoverConfiguredProjects(root)).toEqual(expected);
    const result = await exec(process.execPath, ["--import", loader, script, "--json"], { cwd: root });
    expect(JSON.parse(result.stdout)).toEqual(expected);
    expect(result.stderr).toBe("");
    const human = await exec(process.execPath, ["--import", loader, script], { cwd: root });
    expect(human.stdout).toContain("Manage schedules");
    expect(human.stdout).not.toContain("identity-only");
    expect(human.stdout).not.toContain("HARNESS_DISCOVERY_UNSET_TARGET");
  });

  it.each([
    ["purpose", ""], ["purpose", "  "], ["purpose", 42], ["purpose", null],
    ["topics", "calendar"], ["topics", [""]], ["topics", [42]], ["topics", null],
    ["excludes", {}], ["excludes", ["  "]], ["excludes", ["billing", "billing"]],
  ])("rejects invalid %s metadata (%j)", async (field, value) => {
    const root = await fixture({ app: { remote: "https://example.invalid/app.git", [field]: value } });
    await expect(loadProjectsConfig(resolve(root, "projects.yml"))).rejects.toThrow(`projects.app.${field}`);
  });

  it("validates the complete configuration even when a field is omitted from inventory", async () => {
    const root = await fixture({ app: { remote: "https://example.invalid/app.git", unsupported: true } });
    await expect(discoverConfiguredProjects(root)).rejects.toThrow("unsupported");
  });

  it("rejects unsupported CLI arguments and hides YAML source values on failure", async () => {
    const root = await fixture();
    await expect(exec(process.execPath, ["--import", loader, script, "--write"], { cwd: root }))
      .rejects.toMatchObject({ code: 1, stdout: "", stderr: "Usage: pnpm projects [--json]\n" });
    await writeFile(resolve(root, "projects.local.yml"), "projects: [unpublished-canary\n");
    await expect(exec(process.execPath, ["--import", loader, script, "--json"], { cwd: root }))
      .rejects.toMatchObject({ code: 1, stdout: "", stderr: "Unable to load project inventory; validate projects.yml and projects.local.yml.\n" });
  });
});
