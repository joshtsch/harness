import { access, lstat, mkdir, readFile, readdir, realpath, symlink } from "node:fs/promises";
import { resolve } from "node:path";

export async function loadHarnessSkillNames(sourceRoot: string): Promise<string[]> {
  const entries = await readdir(sourceRoot, { withFileTypes: true });
  const names: string[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (!/^[a-z0-9][a-z0-9-]*$/.test(entry.name)) throw new Error(`invalid harness skill directory: ${entry.name}`);
    const skillFile = resolve(sourceRoot, entry.name, "SKILL.md");
    await access(skillFile);
    const contents = await readFile(skillFile, "utf8");
    if (!new RegExp(`^name:\\s*${entry.name}\\s*$`, "m").test(contents)) {
      throw new Error(`harness skill name must match its directory: ${entry.name}`);
    }
    names.push(entry.name);
  }
  return names.sort();
}

export async function installHarnessSkills(harnessRoot: string, sourceRoot = resolve(harnessRoot, "harness-skills")): Promise<string[]> {
  const names = await loadHarnessSkillNames(sourceRoot);
  for (const name of names) {
    const source = resolve(sourceRoot, name);
    const destination = resolve(harnessRoot, ".agents", "skills", name);
    await mkdir(resolve(harnessRoot, ".agents", "skills"), { recursive: true });
    try {
      await lstat(destination);
      const [actual, expected] = await Promise.all([realpath(destination), realpath(source)]);
      if (actual !== expected) throw new Error(`harness skill destination conflicts with another installation: ${destination}`);
    } catch (error) {
      if (error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT") {
        await symlink(source, destination, "junction");
      } else {
        throw error;
      }
    }
  }
  return names;
}

export async function linkLocalSkill(skillName: string, sourcePath: string, harnessRoot: string): Promise<string> {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(skillName)) {
    throw new Error("skill name must contain only lowercase letters, numbers, and hyphens");
  }

  const source = resolve(sourcePath);
  const destination = resolve(harnessRoot, ".agents", "skills", skillName);
  await access(source);
  await mkdir(resolve(harnessRoot, ".agents", "skills"), { recursive: true });

  try {
    await lstat(destination);
    throw new Error(`skill destination already exists: ${destination}`);
  } catch (error) {
    if (error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT") {
      // Destination is available.
    } else {
      throw error;
    }
  }

  await symlink(source, destination, "junction");
  return destination;
}
