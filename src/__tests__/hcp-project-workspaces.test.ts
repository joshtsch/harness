import { describe, expect, it } from "vitest";
import { projectWorkspaceNames } from "../hcp-project-workspaces.js";
import type { ProjectDefinition } from "../project-config.js";

function project(name: string, hcpWorkspace?: string): ProjectDefinition {
  return {
    name,
    remote: `git@github.com:example/${name}.git`,
    ...(hcpWorkspace ? { hcpWorkspace } : {}),
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
    expect(() => projectWorkspaceNames({ a: project("a", "same"), b: project("b", "same") })).toThrow(/duplicates/);
    expect(() => projectWorkspaceNames({ a: project("a", "platform-bootstrap") })).toThrow(/not an available/);
    expect(() => projectWorkspaceNames({ a: project("a", "invalid\/name") })).toThrow(/not an available/);
  });
});
