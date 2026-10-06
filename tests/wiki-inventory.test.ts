import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { discoverProjectWikis } from "../src/wiki-inventory.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("discoverProjectWikis", () => {
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
