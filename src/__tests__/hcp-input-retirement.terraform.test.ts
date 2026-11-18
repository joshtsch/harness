import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { retirementMovedBlocks, type ProjectInputAddress } from "../hcp-project-workspaces.js";

// Mock-provider proof that generated moves bypass prevent_destroy only for listed inputs.
// Needs a local Terraform with registry access; CI has no Terraform, so it skips there.
const terraform = spawnSync("terraform", ["version"], { encoding: "utf8" });
const root = resolve("infrastructure/hcp");
const directories: string[] = [];

function inputs(environment: Record<string, string>, terraformInputs: Record<string, string> = {}): string {
  return `{ "synthetic-project" = { environment = ${JSON.stringify(environment).replace(/:/g, "=")}, terraform = ${JSON.stringify(terraformInputs).replace(/:/g, "=")} } }`;
}

function planAfterSeed(retire: ProjectInputAddress[], remaining: string): { status: number | null; stdout: string; stderr: string } {
  const directory = mkdtempSync(join(tmpdir(), "hcp-retire-"));
  directories.push(directory);
  const seed = join(directory, "seed");
  mkdirSync(join(directory, "tests"));
  mkdirSync(seed);
  for (const file of ["main.tf", "project-variables.tf", "variables.tf", "versions.tf", ".terraform.lock.hcl"]) {
    copyFileSync(join(root, file), join(directory, file));
    if (file.endsWith(".tf")) copyFileSync(join(root, file), join(seed, file));
  }
  writeFileSync(join(directory, "onboarding-retire.tf"), retirementMovedBlocks(retire));
  writeFileSync(join(directory, "tests", "retire.tftest.hcl"), `
mock_provider "tfe" {
  mock_resource "tfe_workspace" {
    defaults = { id = "ws-abcdefghijklmnop" }
  }
}
override_data {
  target = data.tfe_workspace.platform_bootstrap
  values = { id = "ws-1234567890123456" }
}
variables {
  tfe_organization        = "synthetic-organization"
  project_workspace_names = ["synthetic-project"]
}
run "seed" {
  command   = apply
  state_key = "control-plane"
  module { source = "./seed" }
  variables { project_workspace_variables = ${inputs({ STALE_TOKEN: "a", KEPT_TOKEN: "b" }, { stale_name: "c" })} }
}
run "retire" {
  command   = plan
  state_key = "control-plane"
  variables { project_workspace_variables = ${remaining} }
  assert {
    condition     = keys(tfe_variable.project_input) == [jsonencode(["synthetic-project", "environment", "KEPT_TOKEN"])]
    error_message = "Only the kept input may remain managed."
  }
}
`);
  const init = spawnSync("terraform", [`-chdir=${directory}`, "init", "-backend=false", "-input=false"], { encoding: "utf8" });
  expect(init.status, init.stderr).toBe(0);
  return spawnSync("terraform", [`-chdir=${directory}`, "test", "-no-color"], { encoding: "utf8" });
}

afterAll(() => {
  for (const directory of directories) rmSync(directory, { recursive: true, force: true });
});

describe.skipIf(terraform.status !== 0)("project input retirement under Terraform", () => {
  it("destroys exactly the listed inputs", () => {
    const result = planAfterSeed([
      ["synthetic-project", "environment", "STALE_TOKEN"],
      ["synthetic-project", "terraform", "stale_name"],
    ], inputs({ KEPT_TOKEN: "b" }));
    expect(result.status, result.stdout + result.stderr).toBe(0);
  }, 120_000);

  it("keeps prevent_destroy for an omitted input that is not listed", () => {
    const result = planAfterSeed([["synthetic-project", "environment", "STALE_TOKEN"]], inputs({ KEPT_TOKEN: "b" }));
    expect(result.status).not.toBe(0);
    expect(result.stdout + result.stderr).toContain("Instance cannot be destroyed");
  }, 120_000);

  it("refuses to retire an input the new map still supplies", () => {
    const result = planAfterSeed([["synthetic-project", "environment", "STALE_TOKEN"]], inputs({ STALE_TOKEN: "a", KEPT_TOKEN: "b" }, { stale_name: "c" }));
    expect(result.status).not.toBe(0);
    expect(result.stdout + result.stderr).toContain("Moved object still exists");
  }, 120_000);
});
