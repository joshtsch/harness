// Claude Code PreToolUse hook for Bash. Runs on every Bash call, so it only
// loads the TypeScript guard when the command mentions a git commit.
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

let input = "";
for await (const chunk of process.stdin) input += chunk;
const command = JSON.parse(input || "{}").tool_input?.command ?? "";
if (!/\bgit\b[\s\S]*\bcommit\b/.test(command)) process.exit(0);

const root = resolve(import.meta.dirname, "../..");
const result = spawnSync(process.execPath, ["--import", "tsx", resolve(root, "scripts/git-guard.ts")], { cwd: root, input, stdio: ["pipe", "inherit", "inherit"] });
if (result.status === 0 || result.status === 2) process.exit(result.status);
// Exit 2 so a guard that cannot run blocks the commit instead of failing open.
console.error("Harness commit guard could not run; run pnpm install in the harness, then retry.");
process.exit(2);
