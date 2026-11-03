import { describe, expect, it } from "vitest";
import { bashWriteTargets, defaultCloneProject, toolWriteTargets } from "../src/default-clone-guard.js";

const projects = "/h/projects";
const names = ["railbird", "skills"];

describe("default-clone guard", () => {
  it("classifies paths inside configured default clones", () => {
    expect(defaultCloneProject("/h/projects/railbird/README.md", projects, names)).toBe("railbird");
    expect(defaultCloneProject("/h/projects/railbird", projects, names)).toBe("railbird");
    expect(defaultCloneProject("/h/projects/skills/a/b.ts", projects, names)).toBe("skills");
  });

  it("allows external worktrees, unconfigured directories, and the harness", () => {
    expect(defaultCloneProject("/h-worktrees/railbird/42-fix/README.md", projects, names)).toBeUndefined();
    expect(defaultCloneProject("/h/projects/.claude/worktrees/x/src/a.ts", projects, names)).toBeUndefined();
    expect(defaultCloneProject("/h/projects/railbird-old/a.ts", projects, names)).toBeUndefined();
    expect(defaultCloneProject("/h/projects", projects, names)).toBeUndefined();
    expect(defaultCloneProject("/h/src/a.ts", projects, names)).toBeUndefined();
  });

  it("finds Bash redirection and tee targets", () => {
    expect(bashWriteTargets("echo x > README.md", "/h/projects/railbird")).toEqual(["/h/projects/railbird/README.md"]);
    expect(bashWriteTargets("cd railbird && cat <<'EOF' >> a.txt\nbody > b\nEOF", "/h/projects")).toEqual(["/h/projects/railbird/a.txt"]);
    expect(bashWriteTargets("ls 2>/dev/null | tee -a out.log 2>&1", "/w")).toEqual(["/w/out.log"]);
    expect(bashWriteTargets("git status && grep '>' a.ts", "/w")).toEqual([]);
  });

  it("reads the target of each file tool", () => {
    expect(toolWriteTargets({ cwd: "/w", tool_name: "Edit", tool_input: { file_path: "/h/a.ts" } })).toEqual(["/h/a.ts"]);
    expect(toolWriteTargets({ cwd: "/w", tool_name: "NotebookEdit", tool_input: { notebook_path: "n.ipynb" } })).toEqual(["/w/n.ipynb"]);
    expect(toolWriteTargets({ cwd: "/w", tool_name: "Bash", tool_input: { command: "echo > x" } })).toEqual(["/w/x"]);
  });
});
