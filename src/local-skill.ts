import { access, lstat, mkdir, symlink } from "node:fs/promises";
import { resolve } from "node:path";

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
