import { describe, expect, it } from "vitest";
import { projectWorkspaceInventory, projectWorkspaceNames } from "../hcp-project-workspaces.js";
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
