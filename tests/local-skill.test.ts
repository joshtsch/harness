import { mkdtemp, mkdir, readlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { installHarnessSkills, loadHarnessSkillNames } from "../src/local-skill.js";

describe("tracked harness skills", () => {
  it("discovers skills and links them into the provider skill directory idempotently", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "harness-local-skills-"));
    const source = resolve(root, "harness-skills");
    const skill = resolve(source, "knowledge-routing");
    await mkdir(skill, { recursive: true });
    await writeFile(resolve(skill, "SKILL.md"), "---\nname: knowledge-routing\n---\n");

    await expect(loadHarnessSkillNames(source)).resolves.toEqual(["knowledge-routing"]);
    await expect(installHarnessSkills(root)).resolves.toEqual(["knowledge-routing"]);
    await expect(installHarnessSkills(root)).resolves.toEqual(["knowledge-routing"]);
    await expect(readlink(resolve(root, ".agents/skills/knowledge-routing"))).resolves.toBe(skill);
  });

  it("rejects mismatched skill names and conflicting destinations", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "harness-local-skills-"));
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
