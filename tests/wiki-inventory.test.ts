import { mkdtemp, rm, writeFile, mkdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { discoverProjectWikis } from "../src/wiki-inventory.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("discoverProjectWikis", () => {
  it("discovers a root-layout vault from local metadata without changing public configuration", async () => {
    const root = await mkdtemp(join(tmpdir(), "harness-wikis-"));
    temporaryDirectories.push(root);
    const publicConfiguration = "defaults:\n  default_branch: main\n  setup_script: scripts/setup.sh\n  issue_tracker:\n    type: github\nprojects: {}\n";
    await writeFile(join(root, "projects.yml"), publicConfiguration);
    await writeFile(join(root, "projects.local.yml"), [
      "projects:",
      "  local-vault:",
      "    remote: git@github.com:example/local-vault.git",
      "    wiki:",
      "      description: Harness knowledge vault",
      "      topics: [harness, agent-tooling]",
      "      pages: wiki",
      "      raw: raw",
      "      templates: templates",
    ].join("\n"));

    await expect(discoverProjectWikis(root)).resolves.toEqual([{
      project: "local-vault",
      projectRoot: join(root, "projects", "local-vault"),
      description: "Harness knowledge vault",
      topics: ["harness", "agent-tooling"],
      pages: "wiki",
      raw: "raw",
      templates: "templates",
    }]);
    expect(await readFile(join(root, "projects.yml"), "utf8")).toBe(publicConfiguration);
  });

  it("returns wiki paths for configured child projects", async () => {
    const root = await mkdtemp(join(tmpdir(), "harness-wikis-"));
    temporaryDirectories.push(root);
    await mkdir(join(root, "projects"), { recursive: true });
    await writeFile(join(root, "projects.yml"), [
      "defaults:",
      "  default_branch: main",
      "  setup_script: scripts/setup.sh",
      "  issue_tracker:",
      "    type: github",
      "projects:",
      "  private-project-wiki:",
      "    remote: git@github.com:example/private-project-wiki.git",
      "    wiki:",
      "      description: Private project planning wiki",
      "      topics: [health topic, medical topic]",
      "      pages: docs/wiki",
      "      raw: docs/raw",
      "      templates: docs/templates",
    ].join("\n"));

    await expect(discoverProjectWikis(root)).resolves.toEqual([{
      project: "private-project-wiki",
      projectRoot: join(root, "projects", "private-project-wiki"),
      description: "Private project planning wiki",
      topics: ["health topic", "medical topic"],
      pages: "docs/wiki",
      raw: "docs/raw",
      templates: "docs/templates",
    }]);
  });
});
