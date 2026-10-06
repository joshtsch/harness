#!/usr/bin/env tsx
import { parseAgentProviderArgs, prerequisitesForProvider, verifyPrerequisites } from "../src/prerequisites.js";

const provider = parseAgentProviderArgs(process.argv.slice(2), "Usage: pnpm check:prereqs [--provider codex|gemini]");
await verifyPrerequisites(prerequisitesForProvider(provider));
console.log("prerequisites: ready");
