#!/usr/bin/env tsx
import { resolve } from "node:path";
import { createProject, type ProjectVisibility, type RemoteProtocol } from "../src/project-creation.js";

const args = process.argv.slice(2);
const name = args.shift();
let visibility: ProjectVisibility | undefined;
let remoteProtocol: RemoteProtocol | undefined;
let dryRun = false;
let resume = false;

try {
  if (!name) throw new Error("Usage: pnpm create:project <name> [--public|--private] [--remote-protocol ssh|https] [--dry-run|--resume]");
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--public" || arg === "--private") {
      if (visibility) throw new Error("exactly one visibility flag is required: --public or --private");
      visibility = arg.slice(2) as ProjectVisibility;
    } else if (arg === "--remote-protocol") {
      const value = args[++index];
      if (!value || (value !== "ssh" && value !== "https")) throw new Error("remote protocol must be ssh or https");
      remoteProtocol = value;
    } else if (arg === "--dry-run") {
      dryRun = true;
    } else if (arg === "--resume") {
      resume = true;
    } else {
      throw new Error(`unknown option: ${arg}`);
    }
  }
  const result = await createProject({ harnessRoot: resolve("."), name, visibility, remoteProtocol, dryRun, resume });
  console.log(`${result.status}: ${result.projectPath}`);
  console.log(`remote: ${result.remote}`);
} catch (error: unknown) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
