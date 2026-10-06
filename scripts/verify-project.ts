#!/usr/bin/env tsx
import { verifyProjectReady } from "../src/session/index.js";

const worktreePath = process.argv[2];
if (!worktreePath) throw new Error("Usage: pnpm verify <worktree-path>");
await verifyProjectReady(worktreePath);
console.log(`ready: ${worktreePath}`);
