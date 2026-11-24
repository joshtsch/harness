import { describe, expect, it } from "vitest";
import {
  parseProjectInputRetirements,
  projectInputStateAddress,
  projectWorkspaceInventory,
  projectWorkspaceNames,
  retirementMovedBlocks,
} from "../hcp-project-workspaces.js";
import type { ProjectDefinition } from "../project-config.js";

function project(name: string, hcpWorkspace?: string, hcpOrganization?: string): ProjectDefinition {
  return {
    name,
    remote: `git@github.com:example/${name}.git`,
    ...(hcpWorkspace ? { hcpWorkspace } : {}),
    ...(hcpOrganization ? { hcpOrganization } : {}),
    defaultBranch: "main",
    setupScript: "scripts/setup.sh",
    issueTracker: { type: "github" },
    businessLines: [],
    toolMappings: {},
    verification: [],
    workflows: [],
  };
}

describe("projectWorkspaceNames", () => {
  it("includes only Terraform projects in stable order", () => {
    expect(projectWorkspaceNames({ z: project("z", "z-app"), other: project("other"), a: project("a", "a-app") }))
      .toEqual(["a-app", "z-app"]);
  });

  it("rejects collisions and reserved names before a Terraform run", () => {
    expect(() => projectWorkspaceNames({
      a: project("a", "same", "org-a"),
      b: project("b", "same", "org-b"),
    })).toThrow(/duplicates/);
    expect(() => projectWorkspaceNames({ a: project("a", "platform-bootstrap") })).toThrow(/not an available/);
    expect(() => projectWorkspaceNames({ a: project("a", "invalid\/name") })).toThrow(/not an available/);
  });
  it("assigns explicitly configured workspaces to dedicated organizations", () => {
    expect(projectWorkspaceInventory({
      finance: project("finance", "finance-state", "finance-org"),
      tax: project("tax", "tax-state", "finance-org"),
      shared: project("shared", "shared-state"),
    })).toEqual({
      workspaceNames: ["finance-state", "shared-state", "tax-state"],
      workspaceOrganizations: { "finance-state": "finance-org", "tax-state": "finance-org" },
      organizationNames: ["finance-org"],
    });
  });

  it("rejects organizations without workspaces and invalid names", () => {
    expect(() => projectWorkspaceInventory({ a: project("a", undefined, "finance-org") })).toThrow(/requires hcp_workspace/);
    expect(() => projectWorkspaceInventory({ a: project("a", "finance-state", "invalid\/org") })).toThrow(/valid HCP organization/);
  });
});

describe("project input retirements", () => {
  const supplied = { "a-app": { environment: { KEPT: "value" } } };

  it("accepts listed inputs that the new map omits", () => {
    expect(parseProjectInputRetirements('[["a-app","environment","OLD"],["a-app","terraform","old_name"]]', ["a-app"], supplied))
      .toEqual([["a-app", "environment", "OLD"], ["a-app", "terraform", "old_name"]]);
  });

  it("refuses malformed, unregistered, duplicate and still-supplied entries", () => {
    expect(() => parseProjectInputRetirements("{}", ["a-app"], supplied)).toThrow(/JSON array/);
    expect(() => parseProjectInputRetirements("[]", ["a-app"], supplied)).toThrow(/JSON array/);
    expect(() => parseProjectInputRetirements('[["a-app","env","OLD"]]', ["a-app"], supplied)).toThrow(/registered workspace input/);
    expect(() => parseProjectInputRetirements('[["other","environment","OLD"]]', ["a-app"], supplied)).toThrow(/registered workspace input/);
    expect(() => parseProjectInputRetirements('[["a-app","environment","OLD"],["a-app","environment","OLD"]]', ["a-app"], supplied)).toThrow(/twice/);
    expect(() => parseProjectInputRetirements('[["a-app","environment","KEPT"]]', ["a-app"], supplied)).toThrow(/still supplies/);
    expect(() => parseProjectInputRetirements('[["a-app","environment","OLD"]]', ["a-app"], undefined)).toThrow(/complete project inputs map/);
  });

  it("matches the state address format and moves only listed instances", () => {
    expect(projectInputStateAddress(["a-app", "environment", "OLD"]))
      .toBe(String.raw`tfe_variable.project_input["[\"a-app\",\"environment\",\"OLD\"]"]`);
    expect(retirementMovedBlocks([["a-app", "environment", "OLD"]])).toBe([
      "moved {",
      String.raw`  from = tfe_variable.project_input["[\"a-app\",\"environment\",\"OLD\"]"]`,
      String.raw`  to   = tfe_variable.retired_project_input["[\"a-app\",\"environment\",\"OLD\"]"]`,
      "}",
      "",
    ].join("\n"));
  });
});
