// Claude Code PreToolUse hook for Edit, Write, NotebookEdit, and Bash. Bash calls
// only load the TypeScript guard when the command may write a file.
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

let input = "";
for await (const chunk of process.stdin) input += chunk;
let event;
try {
  event = JSON.parse(input || "{}");
} catch {
  console.error("Harness default-clone guard could not parse the hook input.");
  process.exit(2);
}
if (event.tool_name === "Bash" && !/>|\btee\b/.test(event.tool_input?.command ?? "")) process.exit(0);

const root = resolve(import.meta.dirname, "../..");
const result = spawnSync(process.execPath, ["--import", "tsx", resolve(root, "scripts/default-clone-guard.ts")], { cwd: root, input, stdio: ["pipe", "inherit", "inherit"] });
if (result.status === 0 || result.status === 2) process.exit(result.status);
// Exit 2 so a guard that cannot run blocks the write instead of failing open.
console.error("Harness default-clone guard could not run; fix the error above (often a missing pnpm install in the harness), then retry.");
process.exit(2);
