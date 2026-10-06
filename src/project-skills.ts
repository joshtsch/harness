import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";

interface SkillLockEntry {
  skillPath?: unknown;
}

interface SkillLockFile {
  skills?: unknown;
}

function readSkillEntries(value: unknown): Record<string, SkillLockEntry> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("skills-lock.json must contain a skills object");
  }

  const entries: Record<string, SkillLockEntry> = {};
  for (const [name, entry] of Object.entries(value)) {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      throw new Error(`skills-lock.json entry ${name} must be an object`);
    }
    const skillPath = (entry as SkillLockEntry).skillPath;
    if (typeof skillPath !== "string" || !skillPath.endsWith("/SKILL.md")) {
      throw new Error(`skills-lock.json entry ${name} must declare a skillPath ending in /SKILL.md`);
    }
    entries[name] = entry as SkillLockEntry;
  }
  return entries;
}

export async function loadProjectSkillNames(lockFile: string): Promise<string[]> {
  const parsed = JSON.parse(await readFile(lockFile, "utf8")) as SkillLockFile;
  return Object.keys(readSkillEntries(parsed.skills));
}

export async function verifyProjectSkills(harnessRoot: string, lockFile: string): Promise<void> {
  const names = await loadProjectSkillNames(lockFile);
  const missing: string[] = [];

  for (const name of names) {
    try {
      await access(resolve(harnessRoot, ".agents", "skills", name, "SKILL.md"));
    } catch {
      missing.push(name);
    }
  }

  if (missing.length > 0) {
    throw new Error(`Project skill installation is incomplete; missing SKILL.md for: ${missing.join(", ")}`);
  }
}
