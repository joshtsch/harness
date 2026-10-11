import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { executeSync, githubRepositories, parseArguments } from "../scripts/sync-shared-secret.js";
import { loadProjectsConfig } from "../src/project-config.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("shared secret sync", () => {
  it("selects GitHub repositories from the public config and local overlay", async () => {
    const directory = await mkdtemp(join(tmpdir(), "harness-secret-sync-"));
    temporaryDirectories.push(directory);
    await writeFile(join(directory, "projects.yml"), [
      "defaults:",
      "  default_branch: main",
      "  setup_script: scripts/setup.sh",
      "  issue_tracker:",
      "    type: github",
      "projects:",
      "  public-project:",
      "    remote: https://github.com/example/public.git",
      "    issue_tracker:",
      "      repository: example/public",
    ].join("\n"));
    await writeFile(join(directory, "projects.local.yml"), [
      "projects:",
      "  private-project:",
      "    remote: https://github.com/example/private.git",
      "    issue_tracker:",
      "      repository: example/private",
    ].join("\n"));

    const projects = await loadProjectsConfig(join(directory, "projects.yml"), {
      resolveEnvironment: false,
      localConfigPath: join(directory, "projects.local.yml"),
    });
    expect(githubRepositories(projects)).toEqual(["example/public", "example/private"]);
  });

  it("defaults to dry run without writing", async () => {
    const write = vi.fn(async () => undefined);
    await expect(executeSync(["SHARED_KEY"], ["example/repo"], "test-value", write)).resolves.toContain("Dry run");
    expect(write).not.toHaveBeenCalled();
  });

  it("validates arguments and requires a value only for apply", async () => {
    expect(() => parseArguments(["lowercase"])).toThrow("Usage:");
    expect(() => parseArguments(["KEY", "--apply", "--apply"])).toThrow("Usage:");
    await expect(executeSync(["KEY", "--apply"], ["example/repo"], undefined, vi.fn())).rejects.toThrow("HARNESS_SHARED_SECRET_VALUE");
  });

  it("reports the failed repository and completed count without exposing the secret", async () => {
    const write = vi.fn(async (repository: string) => {
      if (repository === "example/second") throw new Error("GitHub CLI exited with status 1.");
    });
    await expect(executeSync(
      ["KEY", "--apply"],
      ["example/first", "example/second", "example/third"],
      "never-print-this-value",
      write,
    )).rejects.toThrow("stopped after 1 of 3 repositories; example/second failed");
    expect(write).toHaveBeenCalledTimes(2);
  });
});
