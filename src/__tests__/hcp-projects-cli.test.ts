import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const script = resolve("scripts/hcp-projects.ts");
const tsx = pathToFileURL(createRequire(import.meta.url).resolve("tsx")).href;
let directory = "";

// A fake terraform that serves a fixed state list and records each call plus the generated moves.
function harness(state: string[]) {
  directory = mkdtempSync(join(tmpdir(), "hcp-projects-"));
  mkdirSync(join(directory, "infrastructure", "hcp"), { recursive: true });
  mkdirSync(join(directory, "bin"));
  writeFileSync(join(directory, "projects.yml"), [
    "defaults:",
    "  default_branch: main",
    "  setup_script: scripts/setup.sh",
    "  issue_tracker:",
    "    type: github",
    "projects:",
    "  example:",
    "    remote: https://github.com/example/example.git",
    "    hcp_workspace: example-state",
  ].join("\n"));
  writeFileSync(join(directory, "state.txt"), state.join("\n") + "\n");
  writeFileSync(join(directory, "bin", "terraform"), `#!/bin/sh
root="$(dirname "$0")/.."
echo "$*" >> "$root/calls.txt"
case "$*" in
  *"state list"*) cat "$root/state.txt" ;;
  *plan*) cat "$root/infrastructure/hcp/onboarding-retire.tf" > "$root/moves.txt" 2>/dev/null || true ;;
esac
`);
  chmodSync(join(directory, "bin", "terraform"), 0o755);
  return (retire: string, variables = '{"example-state":{"environment":{"KEPT":"v"}}}') => spawnSync(
    process.execPath, ["--import", tsx, script, "plan"],
    {
      cwd: directory,
      encoding: "utf8",
      env: {
        PATH: `${join(directory, "bin")}:${process.env.PATH}`,
        TF_VAR_tfe_organization: "synthetic-organization",
        TF_VAR_project_workspace_variables: variables,
        HCP_RETIRE_PROJECT_INPUTS: retire,
      },
    },
  );
}

const managed = String.raw`tfe_variable.project_input["[\"example-state\",\"environment\",\"OLD\"]"]`;

afterEach(() => rmSync(directory, { recursive: true, force: true }));

describe("pnpm hcp:projects retirements", () => {
  it("lists retiring inputs, plans with their moves, and cleans up", () => {
    const run = harness([managed, String.raw`tfe_variable.project_input["[\"example-state\",\"environment\",\"KEPT\"]"]`]);
    const result = run('[["example-state","environment","OLD"]]');
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("retires (destroys) 1 protected project input(s):\n  - example-state environment OLD");
    expect(readFileSync(join(directory, "moves.txt"), "utf8")).toContain(`from = ${managed}`);
    expect(existsSync(join(directory, "infrastructure", "hcp", "onboarding-retire.tf"))).toBe(false);
    expect(existsSync(join(directory, "infrastructure", "hcp", "onboarding.auto.tfvars"))).toBe(false);
  });

  it("refuses an entry with no managed input before planning", () => {
    const run = harness([managed]);
    const result = run('[["example-state","terraform","missing"]]');
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('match no managed project input: ["example-state","terraform","missing"]');
    expect(readFileSync(join(directory, "calls.txt"), "utf8")).not.toMatch(/\bplan\b/);
    expect(existsSync(join(directory, "infrastructure", "hcp", "onboarding-retire.tf"))).toBe(false);
  });

  it("refuses an entry the new map still supplies before running Terraform", () => {
    const run = harness([managed]);
    const result = run('[["example-state","environment","KEPT"]]');
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("still supplies");
    expect(existsSync(join(directory, "calls.txt"))).toBe(false);
  });

  it("refuses a leftover retire file even without a retire list", () => {
    const run = harness([managed]);
    writeFileSync(join(directory, "infrastructure", "hcp", "onboarding-retire.tf"), "# leftover\n");
    const result = run("");
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("remains from an interrupted run");
    expect(existsSync(join(directory, "calls.txt"))).toBe(false);
    expect(existsSync(join(directory, "infrastructure", "hcp", "onboarding.auto.tfvars"))).toBe(false);
  });
});
