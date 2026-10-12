import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parse } from "dotenv";

export async function loadProjectConfigEnvironment(
  harnessRoot: string,
  processEnvironment: Record<string, string | undefined> = process.env,
): Promise<Record<string, string | undefined>> {
  let localEnvironment: Record<string, string> = {};
  try {
    localEnvironment = parse(await readFile(resolve(harnessRoot, ".env"), "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw new Error("could not read the local .env file for project configuration");
    }
  }

  return { ...localEnvironment, ...processEnvironment };
}
