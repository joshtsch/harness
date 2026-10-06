import { mkdtemp, mkdir, readlink, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { linkLocalSkill } from "../src/local-skill.js";

describe("local skill linking", () => {
  it("links a skill into the harness skill directory", async () => {
    const root = await mkdtemp(join(tmpdir(), "harness-link-"));
    const source = join(root, "skills", "example");
    const harness = join(root, "harness");
    await mkdir(source, { recursive: true });

    try {
      const destination = await linkLocalSkill("example", source, harness);
      expect(await readlink(destination)).toBe(source);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("refuses to replace an existing skill", async () => {
    const root = await mkdtemp(join(tmpdir(), "harness-link-"));
    const source = join(root, "source");
    const harness = join(root, "harness");
    const destination = join(harness, ".agents", "skills", "example");
    await mkdir(source, { recursive: true });
    await mkdir(destination, { recursive: true });

    try {
      await expect(linkLocalSkill("example", source, harness)).rejects.toThrow("already exists");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
