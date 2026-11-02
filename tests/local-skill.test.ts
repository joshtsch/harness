import { lstat, mkdtemp, mkdir, readlink, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { installHarnessSkills, loadHarnessSkillNames } from "../src/local-skill.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("tracked harness skills", () => {
  it("discovers skills and links them into the provider skill directory idempotently", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "harness-local-skills-"));
    roots.push(root);
    const source = resolve(root, "harness-skills");
    const skill = resolve(source, "knowledge-routing");
    await mkdir(skill, { recursive: true });
    await writeFile(resolve(skill, "SKILL.md"), "---\nname: knowledge-routing\n---\n");

    await expect(loadHarnessSkillNames(source)).resolves.toEqual(["knowledge-routing"]);
    await expect(installHarnessSkills(root)).resolves.toEqual(["knowledge-routing"]);
    await expect(installHarnessSkills(root)).resolves.toEqual(["knowledge-routing"]);
    await expect(readlink(resolve(root, ".agents/skills/knowledge-routing"))).resolves.toBe(skill);
  });

  it("prunes links to removed harness skills and preserves other entries", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "harness-local-skills-"));
    roots.push(root);
    const source = resolve(root, "harness-skills");
    await mkdir(resolve(source, "knowledge-routing"), { recursive: true });
    await writeFile(resolve(source, "knowledge-routing", "SKILL.md"), "---\nname: knowledge-routing\n---\n");
    const skills = resolve(root, ".agents/skills");
    await mkdir(resolve(skills, "external"), { recursive: true });
    await mkdir(resolve(root, "local-dev"), { recursive: true });
    await symlink(resolve(source, "removed"), resolve(skills, "removed"));
    await symlink(resolve(root, "local-dev"), resolve(skills, "local-dev"));

    await installHarnessSkills(root);
    await expect(lstat(resolve(skills, "removed"))).rejects.toThrow();
    await expect(lstat(resolve(skills, "external"))).resolves.toBeDefined();
    await expect(readlink(resolve(skills, "local-dev"))).resolves.toBe(resolve(root, "local-dev"));
    await expect(readlink(resolve(skills, "knowledge-routing"))).resolves.toBe(resolve(source, "knowledge-routing"));
  });

  it("prunes cleanly when no harness skills remain", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "harness-local-skills-"));
    roots.push(root);
    await mkdir(resolve(root, "harness-skills"), { recursive: true });
    await expect(installHarnessSkills(root)).resolves.toEqual([]);
  });

  it("rejects mismatched skill names and conflicting destinations", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "harness-local-skills-"));
    roots.push(root);
    const skill = resolve(root, "harness-skills", "knowledge-routing");
    await mkdir(skill, { recursive: true });
    await writeFile(resolve(skill, "SKILL.md"), "---\nname: other-name\n---\n");
    await expect(loadHarnessSkillNames(resolve(root, "harness-skills"))).rejects.toThrow("must match its directory");

    await writeFile(resolve(skill, "SKILL.md"), "---\nname: knowledge-routing\n---\n");
    const destination = resolve(root, ".agents/skills/knowledge-routing");
    await mkdir(destination, { recursive: true });
    await writeFile(resolve(destination, "SKILL.md"), "different skill");
    await expect(installHarnessSkills(root)).rejects.toThrow("conflicts with another installation");
  });
});
