import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createProject } from "../project-creation.js";
import { loadProjectsConfig } from "../project-config.js";

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function harnessFixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "harness-project-creation-"));
  directories.push(root);
  await mkdir(join(root, "projects"), { recursive: true });
  await writeFile(join(root, "projects.yml"), [
    "defaults:",
    "  default_branch: main",
    "  setup_script: scripts/setup.sh",
    "  issue_tracker:",
    "    type: github",
    "projects:",
    "  existing:",
    "    remote: git@github.com:alice/existing.git",
  ].join("\n") + "\n");
  return root;
}

describe("createProject", () => {
  it("validates required visibility and project names before running commands", async () => {
    const root = await harnessFixture();
    const run = async () => ({ code: 0, stdout: "", stderr: "" });

    await expect(createProject({ harnessRoot: root, name: "Bad Name", visibility: "private", run })).rejects.toThrow("lowercase kebab-case");
    await expect(createProject({ harnessRoot: root, name: "new-project", visibility: undefined, run })).rejects.toThrow("exactly one visibility");
  });

  it("dry-runs validation without creating local or remote state", async () => {
    const root = await harnessFixture();
    const calls: string[] = [];
    const run = async (command: string, args: string[]) => {
      calls.push(`${command} ${args.join(" ")}`);
      if (command === "gh" && args[0] === "api" && args[1] === "user") return { code: 0, stdout: "alice\n", stderr: "" };
      if (command === "gh" && args[0] === "config") return { code: 0, stdout: "ssh\n", stderr: "" };
      if (command === "gh" && args[0] === "api") return { code: 1, stdout: "", stderr: "HTTP 404: Not Found" };
      return { code: 0, stdout: "", stderr: "" };
    };

    const result = await createProject({ harnessRoot: root, name: "new-project", visibility: "private", dryRun: true, run });

    expect(result.status).toBe("dry-run");
    expect(calls).toEqual(["gh config get git_protocol", "gh api user --jq .login", "gh api repos/alice/new-project --include"]);
    await expect(stat(join(root, "projects", "new-project"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("creates minimal project, pushes it, and appends validated configuration", async () => {
    const root = await harnessFixture();
    const calls: string[] = [];
    const run = async (command: string, args: string[]) => {
      calls.push(`${command} ${args.join(" ")}`);
      if (command === "gh" && args[0] === "api" && args[1] === "user") return { code: 0, stdout: "alice\n", stderr: "" };
      if (command === "gh" && args[0] === "config") return { code: 0, stdout: "ssh\n", stderr: "" };
      if (command === "gh" && args[0] === "api") return { code: 1, stdout: "", stderr: "HTTP 404: Not Found" };
      return { code: 0, stdout: "", stderr: "" };
    };

    const result = await createProject({ harnessRoot: root, name: "new-project", visibility: "public", remoteProtocol: "ssh", run });

    expect(result.status).toBe("complete");
    expect(calls).toEqual([
      "gh api user --jq .login",
      "gh api repos/alice/new-project --include",
      "git -C " + join(root, "projects", "new-project") + " init --initial-branch main",
      "git -C " + join(root, "projects", "new-project") + " add README.md .gitignore scripts/setup.sh",
      "git -C " + join(root, "projects", "new-project") + " commit -m chore: initialize project",
      "bash " + join(root, "projects", "new-project", "scripts/setup.sh") + " bootstrap",
      "git -C " + join(root, "projects", "new-project") + " status --porcelain",
      "gh repo create alice/new-project --public",
      "git -C " + join(root, "projects", "new-project") + " remote add origin git@github.com:alice/new-project.git",
      "git -C " + join(root, "projects", "new-project") + " push --set-upstream origin main",
    ]);
    expect(await readFile(join(root, "projects", "new-project", "README.md"), "utf8")).toContain("# new-project");
    expect((await stat(join(root, "projects", "new-project", "scripts/setup.sh"))).mode & 0o111).toBeGreaterThan(0);
    await expect(loadProjectsConfig(join(root, "projects.yml"))).resolves.toMatchObject({
      "new-project": {
        remote: "git@github.com:alice/new-project.git",
        defaultBranch: "main",
        issueTracker: { type: "github", repository: "alice/new-project" },
      },
    });
  });

  it("retains recovery state and resumes after a push failure", async () => {
    const root = await harnessFixture();
    let failPush = true;
    const run = async (command: string, args: string[]) => {
      if (command === "gh" && args[0] === "api" && args[1] === "user") return { code: 0, stdout: "alice\n", stderr: "" };
      if (command === "gh" && args[0] === "config") return { code: 0, stdout: "ssh\n", stderr: "" };
      if (command === "gh" && args[0] === "api") return { code: 1, stdout: "", stderr: "HTTP 404: Not Found" };
      if (command === "git" && args.includes("push") && failPush) return { code: 1, stdout: "", stderr: "push failed" };
      return { code: 0, stdout: "", stderr: "" };
    };

    await expect(createProject({ harnessRoot: root, name: "recoverable", visibility: "private", run })).rejects.toThrow("push failed");
    const statePath = join(root, "docs", ".scratch", "project-creation", "recoverable", "state.json");
    expect(await readFile(statePath, "utf8")).toContain('"remoteCreated": true');

    failPush = false;
    const result = await createProject({ harnessRoot: root, name: "recoverable", visibility: "private", resume: true, run });
    expect(result.status).toBe("complete");
    await expect(loadProjectsConfig(join(root, "projects.yml"))).resolves.toHaveProperty("recoverable");
  });
});
