import { resolve } from "node:path";
import { defaultIdentityPath, initializeAgeIdentity } from "../src/secure-setup.js";

const repoRoot = resolve(import.meta.dirname, "..");
const args = process.argv.slice(2);
const identityOption = args.indexOf("--identity");
const requestedPath = identityOption === -1 ? defaultIdentityPath() : args[identityOption + 1];

if (!requestedPath || requestedPath.startsWith("--")) {
  console.error("usage: secure-setup [--identity <path>]");
  process.exitCode = 1;
} else {
  initializeAgeIdentity(requestedPath, repoRoot)
    .then(({ identityPath, recipient, created }) => {
      console.log(`${created ? "created" : "validated"} age identity: ${identityPath}`);
      console.log("Add this session-local primary recipient export (the private identity contents are never printed):");
      console.log(`export HARNESS_SECURE_AGE_IDENTITY=${JSON.stringify(identityPath)}`);
      console.log(`export HARNESS_SECURE_AGE_PRIMARY_RECIPIENT=${JSON.stringify(recipient)}`);
      console.log("New secure-record writes require both recipients; run pnpm secure:custody -- setup first.");
    })
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    });
}
