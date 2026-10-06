import { resolve } from "node:path";
import { linkLocalSkill } from "../src/local-skill.js";

const [, , skillName, sourcePath] = process.argv;
if (!skillName || !sourcePath) {
  console.error("Usage: pnpm link:skill <skill-name> <path-to-skill-directory>");
  process.exitCode = 1;
} else {
  linkLocalSkill(skillName, sourcePath, resolve(import.meta.dirname, ".."))
    .then((destination) => console.log(`Linked ${skillName} at ${destination}`))
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    });
}
