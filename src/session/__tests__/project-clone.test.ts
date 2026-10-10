import { describe, expect, it, vi } from "vitest";
import { ensureProjectClone, type CommandRunner, type ProjectDefinition } from "../project-clone.js";

const project: ProjectDefinition = {
  name: "example-project",
  remote: "git@github.com:joshtsch/example-project.git",
  defaultBranch: "main",
  setupScript: "scripts/setup.sh",
  issueTracker: { type: "github", repository: "joshtsch/example-project" },
  verification: [],
  workflows: [],
};

describe("ensureProjectClone", () => {
  it("clones a missing project into the configured projects directory", async () => {
    const run = vi.fn<CommandRunner>().mockResolvedValue({ code: 0, stdout: "", stderr: "" });
    const stat = vi.fn().mockRejectedValue(Object.assign(new Error("missing"), { code: "ENOENT" }));
    const mkdir = vi.fn().mockResolvedValue(undefined);

    await expect(ensureProjectClone(project, { projectsDirectory: "/workspace/projects", stat, mkdir, run })).resolves.toEqual({
      action: "cloned",
      path: "/workspace/projects/example-project",
    });
    expect(mkdir).toHaveBeenCalledWith("/workspace/projects", { recursive: true });
    expect(run).toHaveBeenCalledWith("git", ["clone", project.remote, "/workspace/projects/example-project"]);
  });

  it("does not alter an existing Git repository", async () => {
    const run = vi.fn<CommandRunner>().mockResolvedValue({ code: 0, stdout: "true\n", stderr: "" });
    const stat = vi.fn().mockResolvedValue({});
    const mkdir = vi.fn();

    await expect(ensureProjectClone(project, { projectsDirectory: "/workspace/projects", stat, mkdir, run })).resolves.toEqual({
      action: "existing",
      path: "/workspace/projects/example-project",
    });
    expect(run).toHaveBeenCalledWith("git", ["-C", "/workspace/projects/example-project", "rev-parse", "--is-inside-work-tree", "--show-prefix"]);
    expect(mkdir).not.toHaveBeenCalled();
  });

  it("rejects an existing path that is not a Git repository", async () => {
    const run = vi.fn<CommandRunner>().mockResolvedValue({ code: 128, stdout: "", stderr: "not a repo" });
    const stat = vi.fn().mockResolvedValue({});
    const mkdir = vi.fn();

    await expect(ensureProjectClone(project, { projectsDirectory: "/workspace/projects", stat, mkdir, run })).rejects.toThrow(
      "already exists and is not a Git repository",
    );
  });
});
