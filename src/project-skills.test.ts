import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { loadProjectSkillNames, verifyProjectSkills } from "./project-skills.js";

async function makeFixture(skills: Record<string, boolean>): Promise<{ root: string; lockFile: string }> {
  const root = await mkdtemp(resolve(tmpdir(), "harness-skills-"));
  const lockFile = resolve(root, "skills-lock.json");
  await writeFile(lockFile, JSON.stringify({
    version: 1,
    skills: Object.fromEntries(Object.keys(skills).map((name) => [name, {
      source: "fixture/source",
      sourceType: "github",
      skillPath: `skills/${name}/SKILL.md`,
      computedHash: "fixture",
    }])),
  }));

  for (const [name, present] of Object.entries(skills)) {
    if (present) {
      const path = resolve(root, ".agents", "skills", name);
      await mkdir(path, { recursive: true });
      await writeFile(resolve(path, "SKILL.md"), `---\nname: ${name}\n---\n`);
    }
  }
  return { root, lockFile };
}

describe("project skill installation", () => {
  it("loads names from the project lockfile", async () => {
    const fixture = await makeFixture({ alpha: true, beta: true });
    await expect(loadProjectSkillNames(fixture.lockFile)).resolves.toEqual(["alpha", "beta"]);
  });

  it("fails when a locked skill is not installed", async () => {
    const fixture = await makeFixture({ alpha: true, beta: false });
    await expect(verifyProjectSkills(fixture.root, fixture.lockFile)).rejects.toThrow("beta");
  });

  it("passes when every locked skill has a SKILL.md", async () => {
    const fixture = await makeFixture({ alpha: true, beta: true });
    await expect(verifyProjectSkills(fixture.root, fixture.lockFile)).resolves.toBeUndefined();
  });
});
