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
  *plan*) cat "$root/infrastructure/hcp/onboarding-retire.tf" > "$root/moves.txt" 2>/dev/null || true
    cat "$root/infrastructure/hcp/onboarding.auto.tfvars" > "$root/tfvars.txt" ;;
esac
`);
  chmodSync(join(directory, "bin", "terraform"), 0o755);
  // A null map leaves TF_VAR_project_workspace_variables unset; args and input reach the CLI.
  return (retire: string, variables: string | null = '{"example-state":{"environment":{"KEPT":"v"}}}', args: string[] = [], input?: string) => spawnSync(
    process.execPath, ["--import", tsx, script, "plan", ...args],
    {
      cwd: directory,
      encoding: "utf8",
      input,
      env: {
        PATH: `${join(directory, "bin")}:${process.env.PATH}`,
        TF_VAR_tfe_organization: "synthetic-organization",
        ...(variables === null ? {} : { TF_VAR_project_workspace_variables: variables }),
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

describe("pnpm hcp:projects --variables-file", () => {
  const map = '{"example-state":{"terraform":{"piped":"from-a-note"}}}';

  it("reads the project inputs map from stdin and keeps no copy", () => {
    const result = harness([])("", null, ["--variables-file", "-"], map);
    expect(result.status, result.stderr).toBe(0);
    expect(readFileSync(join(directory, "tfvars.txt"), "utf8")).toContain('project_workspace_variables = {"example-state":{"terraform":{"piped":"from-a-note"}}}');
    expect(existsSync(join(directory, "infrastructure", "hcp", "onboarding.auto.tfvars"))).toBe(false);
  });

  it("refuses the map from both the environment and --variables-file", () => {
    const result = harness([])("", undefined, ["--variables-file", "-"], map);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("both TF_VAR_project_workspace_variables and --variables-file");
    expect(existsSync(join(directory, "calls.txt"))).toBe(false);
  });

  it("validates a piped map like the environment one", () => {
    const result = harness([])("", null, ["--variables-file", "-"], '{"unregistered":{}}');
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("must map registered workspaces");
  });
});
