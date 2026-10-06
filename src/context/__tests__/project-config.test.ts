import { mkdir, writeFile } from "node:fs/promises";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadProjectsConfig, type ProjectDefinition } from "../../project-config.js";
import { loadSessionContext, loadSessionToolMappings, sessionToolMappingsPath, resolveSessionToolContext, resolveToolContext, type BusinessLine } from "../index.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("loadProjectsConfig", () => {
  it("merges defaults into a project definition", async () => {
    const directory = await mkdtemp(join(tmpdir(), "harness-config-"));
    temporaryDirectories.push(directory);
    const configPath = join(directory, "projects.yml");
    await writeFile(
      configPath,
      [
        "defaults:",
        "  default_branch: main",
        "  setup_script: scripts/setup.sh",
        "  issue_tracker:",
        "    type: github",
        "projects:",
        "  example-project:",
        "    remote: git@github.com:joshtsch/example-project.git",
        "    issue_tracker:",
        "      repository: joshtsch/example-project",
        "    crm:",
        "      type: attio",
      ].join("\n"),
    );

    await expect(loadProjectsConfig(configPath)).resolves.toEqual({
      "example-project": {
        name: "example-project",
        remote: "git@github.com:joshtsch/example-project.git",
        defaultBranch: "main",
        setupScript: "scripts/setup.sh",
        issueTracker: { type: "github", repository: "joshtsch/example-project" },
        crm: { type: "attio" },
        businessLines: [],
        toolMappings: {},
        verification: [],
        workflows: [],
      },
    });
  });

  it("merges an ignored local overlay with local values taking priority", async () => {
    const directory = await mkdtemp(join(tmpdir(), "harness-config-"));
    temporaryDirectories.push(directory);
    await writeFile(join(directory, "projects.yml"), [
      "defaults:",
      "  default_branch: main",
      "  setup_script: scripts/setup.sh",
      "  issue_tracker:",
      "    type: github",
      "projects:",
      "  example-project:",
      "    remote: https://github.com/example/project.git",
      "    verification:",
      "      - command: pnpm",
      "        args: [test]",
    ].join("\n"));
    await writeFile(join(directory, "projects.local.yml"), [
      "defaults:",
      "  setup_script: scripts/local-setup.sh",
      "projects:",
      "  example-project:",
      "    remote: https://github.com/local/project.git",
      "    verification:",
      "      - command: pnpm",
      "        args: [typecheck]",
    ].join("\n"));

    await expect(loadProjectsConfig(join(directory, "projects.yml"))).resolves.toMatchObject({
      "example-project": {
        remote: "https://github.com/local/project.git",
        setupScript: "scripts/local-setup.sh",
        verification: [{ command: "pnpm", args: ["typecheck"], required: true }],
      },
    });
  });

  it("rejects unknown fields at every configuration level", async () => {
    const directory = await mkdtemp(join(tmpdir(), "harness-config-"));
    temporaryDirectories.push(directory);
    const configPath = join(directory, "projects.yml");
    await writeFile(configPath, [
      "defaults:",
      "  default_branch: main",
      "  setup_script: scripts/setup.sh",
      "  issue_tracker:",
      "    type: github",
      "projects:",
      "  example-project:",
      "    remote: git@github.com:joshtsch/example-project.git",
      "    unsupported: true",
    ].join("\n"));

    await expect(loadProjectsConfig(configPath)).rejects.toThrow("projects.example-project.unsupported is not supported");
  });

  it("rejects unknown nested default fields", async () => {
    const directory = await mkdtemp(join(tmpdir(), "harness-config-"));
    temporaryDirectories.push(directory);
    const configPath = join(directory, "projects.yml");
    await writeFile(configPath, [
      "defaults:",
      "  default_branch: main",
      "  setup_script: scripts/setup.sh",
      "  issue_tracker:",
      "    type: github",
      "    token: secret",
      "projects:",
      "  example-project:",
      "    remote: git@github.com:joshtsch/example-project.git",
    ].join("\n"));

    await expect(loadProjectsConfig(configPath)).rejects.toThrow("defaults.issue_tracker.token is not supported");
  });

  it("rejects project-only fields in defaults and invalid optional values", async () => {
    const directory = await mkdtemp(join(tmpdir(), "harness-config-"));
    temporaryDirectories.push(directory);
    const configPath = join(directory, "projects.yml");
    await writeFile(configPath, [
      "defaults:",
      "  remote: should-not-be-defaulted",
      "projects:",
      "  example-project:",
      "    remote: git@github.com:joshtsch/example-project.git",
      "    crm: null",
    ].join("\n"));

    await expect(loadProjectsConfig(configPath)).rejects.toThrow("defaults.remote is not supported");
  });

  it("rejects invalid optional field types", async () => {
    const directory = await mkdtemp(join(tmpdir(), "harness-config-"));
    temporaryDirectories.push(directory);
    const configPath = join(directory, "projects.yml");
    await writeFile(configPath, [
      "defaults:",
      "  default_branch: main",
      "  setup_script: scripts/setup.sh",
      "  issue_tracker:",
      "    type: github",
      "    repository: 42",
      "projects:",
      "  example-project:",
      "    remote: git@github.com:joshtsch/example-project.git",
    ].join("\n"));

    await expect(loadProjectsConfig(configPath)).rejects.toThrow(
      "projects.example-project.issue_tracker.repository must be a non-empty string",
    );
  });

  it("rejects unknown top-level fields and malformed nested values", async () => {
    const directory = await mkdtemp(join(tmpdir(), "harness-config-"));
    temporaryDirectories.push(directory);
    const configPath = join(directory, "projects.yml");
    await writeFile(configPath, [
      "defaults:",
      "  default_branch: main",
      "  setup_script: scripts/setup.sh",
      "  issue_tracker:",
      "    type: github",
      "projects:",
      "  example-project:",
      "    remote: git@github.com:joshtsch/example-project.git",
      "    issue_tracker: []",
      "unexpected: true",
    ].join("\n"));

    await expect(loadProjectsConfig(configPath)).rejects.toThrow("configuration.unexpected is not supported");
  });

  it("rejects duplicate project remotes", async () => {
    const directory = await mkdtemp(join(tmpdir(), "harness-config-"));
    temporaryDirectories.push(directory);
    const configPath = join(directory, "projects.yml");
    await writeFile(configPath, [
      "defaults:",
      "  default_branch: main",
      "  setup_script: scripts/setup.sh",
      "  issue_tracker:",
      "    type: github",
      "projects:",
      "  example-project:",
      "    remote: git@github.com:joshtsch/example-project.git",
      "  lake-paws:",
      "    remote: git@github.com:joshtsch/example-project.git",
    ].join("\n"));

    await expect(loadProjectsConfig(configPath)).rejects.toThrow(
      "projects.lake-paws.remote duplicates projects.example-project.remote",
    );
  });

  it("rejects missing required values", async () => {
    const directory = await mkdtemp(join(tmpdir(), "harness-config-"));
    temporaryDirectories.push(directory);
    const configPath = join(directory, "projects.yml");
    await writeFile(configPath, [
      "projects:",
      "  example-project:",
      "    remote: git@github.com:joshtsch/example-project.git",
    ].join("\n"));

    await expect(loadProjectsConfig(configPath)).rejects.toThrow(
      "projects.example-project.default_branch must be a non-empty string",
    );
  });

  it("parses required verification and optional workflow commands", async () => {
    const directory = await mkdtemp(join(tmpdir(), "harness-config-"));
    temporaryDirectories.push(directory);
    const configPath = join(directory, "projects.yml");
    await writeFile(configPath, [
      "defaults:",
      "  default_branch: main",
      "  setup_script: scripts/setup.sh",
      "  issue_tracker:",
      "    type: github",
      "  verification:",
      "    - command: pnpm",
      "      args: [test]",
      "  workflows:",
      "    - command: pnpm",
      "      args: [lint]",
      "projects:",
      "  example-project:",
      "    remote: git@github.com:joshtsch/example-project.git",
    ].join("\n"));

    await expect(loadProjectsConfig(configPath)).resolves.toMatchObject({
      "example-project": {
        verification: [{ command: "pnpm", args: ["test"], required: true }],
        workflows: [{ command: "pnpm", args: ["lint"], required: false }],
      },
    });
  });

  it("rejects malformed configured commands", async () => {
    const directory = await mkdtemp(join(tmpdir(), "harness-config-"));
    temporaryDirectories.push(directory);
    const configPath = join(directory, "projects.yml");
    await writeFile(configPath, [
      "defaults:",
      "  default_branch: main",
      "  setup_script: scripts/setup.sh",
      "  issue_tracker:",
      "    type: github",
      "projects:",
      "  example-project:",
      "    remote: git@github.com:joshtsch/example-project.git",
      "    verification:",
      "      - command: pnpm",
      "        args: test",
    ].join("\n"));

    await expect(loadProjectsConfig(configPath)).rejects.toThrow(
      "projects.example-project.verification[0].args must be a list of strings",
    );
  });

  it("parses business lines, memberships, targets, and project mappings", async () => {
    const directory = await mkdtemp(join(tmpdir(), "harness-config-"));
    temporaryDirectories.push(directory);
    const configPath = join(directory, "projects.yml");
    await writeFile(configPath, [
      "defaults:",
      "  default_branch: main",
      "  setup_script: scripts/setup.sh",
      "  issue_tracker:",
      "    type: github",
      "business_lines:",
      "  sales:",
      "    display_name: Sales",
      "    tool_mappings:",
      "      calendar:",
      "        provider: google",
      "        targets:",
      "          - id: sales-calendar",
      "            access: read_write",
      "            default: true",
      "projects:",
      "  example-project:",
      "    remote: git@github.com:joshtsch/example-project.git",
      "    business_lines: [sales]",
      "    tool_mappings:",
      "      crm:",
      "        provider: attio",
      "        targets:",
      "          - id: example-project-workspace",
      "            access: read_write",
    ].join("\n"));

    await expect(loadProjectsConfig(configPath)).resolves.toMatchObject({
      "example-project": {
        businessLines: ["sales"],
        toolMappings: {
          crm: { provider: "attio", targets: [{ id: "example-project-workspace", access: "read_write" }] },
        },
      },
    });
  });

  it("resolves target IDs from environment variables", async () => {
    vi.stubEnv("CITY_TAILS_DRIVE_ID", "workspace-drive-id");
    const directory = await mkdtemp(join(tmpdir(), "harness-config-"));
    temporaryDirectories.push(directory);
    const configPath = join(directory, "projects.yml");
    await writeFile(configPath, [
      "defaults:",
      "  default_branch: main",
      "  setup_script: scripts/setup.sh",
      "  issue_tracker:",
      "    type: github",
      "business_lines:",
      "  city_tails:",
      "    display_name: example project",
      "    tool_mappings:",
      "      drive:",
      "        provider: google-drive-workspace",
      "        targets:",
      "          - id: ${CITY_TAILS_DRIVE_ID}",
      "            access: read_write",
      "projects:",
      "  example-project:",
      "    remote: git@github.com:joshtsch/example-project.git",
      "    business_lines: [city_tails]",
    ].join("\n"));

    await expect(loadProjectsConfig(configPath)).resolves.toMatchObject({
      "example-project": { businessLines: ["city_tails"] },
    });
  });

  it("requires environment variables for target references", async () => {
    const directory = await mkdtemp(join(tmpdir(), "harness-config-"));
    temporaryDirectories.push(directory);
    const configPath = join(directory, "projects.yml");
    await writeFile(configPath, [
      "defaults:",
      "  default_branch: main",
      "  setup_script: scripts/setup.sh",
      "  issue_tracker:",
      "    type: github",
      "projects:",
      "  example-project:",
      "    remote: git@github.com:joshtsch/example-project.git",
      "    tool_mappings:",
      "      drive:",
      "        provider: google-drive-workspace",
      "        targets:",
      "          - id: ${CITY_TAILS_DRIVE_ID}",
      "            access: read_write",
    ].join("\n"));

    await expect(loadProjectsConfig(configPath)).rejects.toThrow(
      "projects.example-project.tool_mappings.drive.targets[0].id environment variable CITY_TAILS_DRIVE_ID must be set",
    );
  });

  it("rejects invalid calendar defaults", async () => {
    const directory = await mkdtemp(join(tmpdir(), "harness-config-"));
    temporaryDirectories.push(directory);
    const configPath = join(directory, "projects.yml");
    await writeFile(configPath, [
      "defaults:",
      "  default_branch: main",
      "  setup_script: scripts/setup.sh",
      "  issue_tracker:",
      "    type: github",
      "business_lines:",
      "  sales:",
      "    display_name: Sales",
      "    tool_mappings:",
      "      calendar:",
      "        provider: google",
      "        targets:",
      "          - id: sales-calendar",
      "            access: read",
      "            default: true",
      "projects:",
      "  example-project:",
      "    remote: git@github.com:joshtsch/example-project.git",
      "    business_lines: [sales]",
    ].join("\n"));

    await expect(loadProjectsConfig(configPath)).rejects.toThrow(
      "business_lines.sales.tool_mappings.calendar default target must be writable",
    );
  });

  it("rejects unknown business-line references", async () => {
    const directory = await mkdtemp(join(tmpdir(), "harness-config-"));
    temporaryDirectories.push(directory);
    const configPath = join(directory, "projects.yml");
    await writeFile(configPath, [
      "defaults:",
      "  default_branch: main",
      "  setup_script: scripts/setup.sh",
      "  issue_tracker:",
      "    type: github",
      "business_lines:",
      "  sales:",
      "    display_name: Sales",
      "projects:",
      "  example-project:",
      "    remote: git@github.com:joshtsch/example-project.git",
      "    business_lines: [missing]",
    ].join("\n"));

    await expect(loadProjectsConfig(configPath)).rejects.toThrow(
      "projects.example-project.business_lines references unknown business line missing",
    );
  });
});

const resolutionProject: ProjectDefinition = {
  name: "example-project",
  remote: "git@github.com:joshtsch/example-project.git",
  defaultBranch: "main",
  setupScript: "scripts/setup.sh",
  issueTracker: { type: "github" },
  businessLines: ["sales", "support"],
  verification: [],
  workflows: [],
};

const resolutionBusinessLines: Record<string, BusinessLine> = {
  sales: {
    key: "sales",
    displayName: "Sales",
    toolMappings: {
      crm: { provider: "attio", targets: [{ id: "sales", access: "read_write" }] },
      calendar: { provider: "google", targets: [{ id: "sales-calendar", access: "read_write", default: true }] },
    },
  },
  support: {
    key: "support",
    displayName: "Support",
    toolMappings: {
      crm: { provider: "attio", targets: [{ id: "support", access: "read_write" }] },
      calendar: { provider: "google", targets: [{ id: "support-calendar", access: "read_write", default: true }] },
    },
  },
};

describe("resolveToolContext", () => {
  it("unions inherited mappings for reads", () => {
    expect(resolveToolContext(resolutionProject, resolutionBusinessLines, "crm")).toEqual({
      tool: "crm",
      mappings: [resolutionBusinessLines.sales.toolMappings.crm, resolutionBusinessLines.support.toolMappings.crm],
      targets: [
        { id: "sales", access: "read_write", provider: "attio" },
        { id: "support", access: "read_write", provider: "attio" },
      ],
    });
  });

  it("uses project mappings as an override and requires an explicit write target", () => {
    const project = {
      ...resolutionProject,
      toolMappings: { crm: { provider: "attio", targets: [{ id: "project", access: "write" as const }] } },
    };
    expect(resolveToolContext(project, resolutionBusinessLines, "crm", { operation: "write", targetId: "project" }).targets).toEqual([
      { id: "project", access: "write", provider: "attio" },
    ]);
  });

  it("requires an explicit target for ambiguous writes and single-record operations", () => {
    expect(() => resolveToolContext(resolutionProject, resolutionBusinessLines, "crm", { operation: "write" })).toThrow(
      "write operation for crm requires an explicit target",
    );
    expect(resolveToolContext(resolutionProject, resolutionBusinessLines, "crm", {
      operation: "single_record",
      targetId: "sales",
    }).targets).toEqual([{ id: "sales", access: "read_write", provider: "attio" }]);
    expect(() => resolveToolContext(resolutionProject, resolutionBusinessLines, "crm", {
      operation: "single_record",
    })).toThrow("single_record operation for crm requires an explicit target");
  });

  it("requires exactly one calendar default for writes", () => {
    expect(() => resolveToolContext(resolutionProject, resolutionBusinessLines, "calendar", { operation: "write" })).toThrow(
      "Calendar writes require exactly one default writable target or an explicit target",
    );
    expect(() => resolveToolContext(resolutionProject, resolutionBusinessLines, "calendar", {
      operation: "write",
      targetId: "support-calendar",
    })).toThrow("Calendar writes require exactly one default writable target or an explicit target");
    const project = {
      ...resolutionProject,
      businessLines: [],
      toolMappings: {
        calendar: {
          provider: "google",
          targets: [
            { id: "default-calendar", access: "read_write" as const, default: true },
            { id: "other-calendar", access: "read_write" as const },
          ],
        },
      },
    };
    expect(() => resolveToolContext(project, {}, "calendar", { operation: "write", targetId: "other-calendar" })).toThrow(
      "Calendar writes require a default writable target",
    );
  });

  it("requires and accepts a provider when target IDs conflict", () => {
    const project = { ...resolutionProject, businessLines: ["sales"] };
    const businessLines = {
      ...resolutionBusinessLines,
      partner: {
        key: "partner",
        displayName: "Partner",
        toolMappings: { crm: { provider: "hubspot", targets: [{ id: "sales", access: "write" as const }] } },
      },
    };
    const conflicted = { ...project, businessLines: ["sales", "partner"] };
    expect(() => resolveToolContext(conflicted, businessLines, "crm", { operation: "write", targetId: "sales" })).toThrow(
      "Target sales is ambiguous for crm; specify the provider",
    );
    expect(resolveToolContext(conflicted, businessLines, "crm", {
      operation: "write",
      provider: "hubspot",
      targetId: "sales",
    }).targets).toEqual([{ id: "sales", access: "write", provider: "hubspot" }]);
    const accessConflict = {
      ...businessLines,
      sales: {
        ...resolutionBusinessLines.sales,
        toolMappings: { crm: { provider: "attio", targets: [{ id: "sales", access: "read" as const }] } },
      },
      salesCopy: {
        key: "salesCopy",
        displayName: "Sales Copy",
        toolMappings: { crm: { provider: "attio", targets: [{ id: "sales", access: "read_write" as const }] } },
      },
    };
    expect(() => resolveToolContext({ ...conflicted, businessLines: ["sales", "salesCopy"] }, accessConflict, "crm")).toThrow(
      "Conflicting mappings for attio:sales",
    );
  });

  it("resolves project-local mappings for an unassigned shared project", () => {
    const project = {
      ...resolutionProject,
      name: "shared-repo-copy",
      businessLines: [],
      toolMappings: { crm: { provider: "attio", targets: [{ id: "local", access: "read_write" as const }] } },
    };
    expect(resolveToolContext(project, resolutionBusinessLines, "crm", { operation: "write", targetId: "local" }).targets).toEqual([
      { id: "local", access: "read_write", provider: "attio" },
    ]);
  });

  it("uses session mappings only for the current resolution", () => {
    const sessionMappings = { crm: { provider: "attio", targets: [{ id: "session", access: "write" as const }] } };
    const project = { ...resolutionProject, toolMappings: { crm: { provider: "attio", targets: [{ id: "project", access: "write" as const }] } } };
    const context = resolveToolContext(project, resolutionBusinessLines, "crm", {
      operation: "write",
      targetId: "session",
    }, { sessionId: "session-1", toolMappings: sessionMappings });
    expect(context.targets).toEqual([{ id: "session", access: "write", provider: "attio" }]);
    expect(resolveToolContext(resolutionProject, resolutionBusinessLines, "crm").targets).toHaveLength(2);
  });

  it("resolves mappings from the active session context", () => {
    expect(resolveSessionToolContext({ sessionId: "session-1", toolMappings: {
      crm: { provider: "attio", targets: [{ id: "session", access: "write" }] },
    } }, resolutionProject, resolutionBusinessLines, "crm", {
      operation: "write",
      targetId: "session",
    })).toMatchObject({ targets: [{ id: "session", provider: "attio" }] });
  });

  it("selects the only writable target for writes and single-record operations", () => {
    const project = { ...resolutionProject, businessLines: ["sales"] };
    expect(resolveToolContext(project, resolutionBusinessLines, "crm", { operation: "write" }).targets).toEqual([
      { id: "sales", access: "read_write", provider: "attio" },
    ]);
    expect(resolveToolContext(project, resolutionBusinessLines, "crm", { operation: "single_record" }).targets).toEqual([
      { id: "sales", access: "read_write", provider: "attio" },
    ]);
  });

  it("does not use write-only targets for reads", () => {
    const project = {
      ...resolutionProject,
      businessLines: ["sales"],
      toolMappings: {
        crm: {
          provider: "attio",
          targets: [
            { id: "readable", access: "read" as const },
            { id: "write-only", access: "write" as const },
          ],
        },
      },
    };
    expect(resolveToolContext(project, resolutionBusinessLines, "crm").targets).toEqual([
      { id: "readable", access: "read", provider: "attio" },
    ]);
    expect(() => resolveToolContext(project, resolutionBusinessLines, "crm", {
      operation: "read",
      targetId: "write-only",
    })).toThrow("Target write-only does not allow read operations");
    expect(() => resolveToolContext({ ...project, toolMappings: {
      crm: { provider: "attio", targets: [{ id: "write-only", access: "write" as const }] },
    } }, resolutionBusinessLines, "crm")).toThrow(
      "No readable crm target is configured for project example-project",
    );
  });

  it("does not fail for an unused missing mapping, but fails when required", () => {
    expect(resolveToolContext({ ...resolutionProject, businessLines: [] }, {}, "calendar")).toEqual({
      tool: "calendar",
      mappings: [],
      targets: [],
    });
    expect(() => resolveToolContext({ ...resolutionProject, businessLines: [] }, {}, "calendar", { required: true })).toThrow(
      "No calendar mapping is configured for project example-project",
    );
  });
});

describe("loadSessionToolMappings", () => {
  it("loads mappings without accepting unrelated session data", async () => {
    const directory = await mkdtemp(join(tmpdir(), "harness-session-"));
    temporaryDirectories.push(directory);
    const configPath = sessionToolMappingsPath(directory, "session-1");
    await mkdir(join(directory, "docs", ".scratch", "setup", "session-1"), { recursive: true });
    await writeFile(configPath, JSON.stringify({
      tool_mappings: { calendar: { provider: "google", targets: [{ id: "temporary", access: "read" }] } },
    }));
    await expect(loadSessionToolMappings(directory, "session-1")).resolves.toEqual({
      calendar: { provider: "google", targets: [{ id: "temporary", access: "read" }] },
    });
    await writeFile(configPath, JSON.stringify({ tool_mappings: {}, credentials: "nope" }));
    await expect(loadSessionToolMappings(directory, "session-1")).rejects.toThrow("session tool metadata.credentials is not supported");
  });

  it("loads one session context for all consumers", async () => {
    const directory = await mkdtemp(join(tmpdir(), "harness-session-"));
    temporaryDirectories.push(directory);
    const configPath = sessionToolMappingsPath(directory, "session-1");
    await mkdir(join(directory, "docs", ".scratch", "setup", "session-1"), { recursive: true });
    await writeFile(configPath, JSON.stringify({
      tool_mappings: { crm: { provider: "attio", targets: [{ id: "session", access: "write" }] } },
    }));
    await expect(loadSessionContext(directory, "session-1")).resolves.toEqual({
      sessionId: "session-1",
      toolMappings: { crm: { provider: "attio", targets: [{ id: "session", access: "write" }] } },
    });
  });

  it("rejects unsafe session IDs and treats absent metadata as empty", async () => {
    const directory = await mkdtemp(join(tmpdir(), "harness-session-"));
    temporaryDirectories.push(directory);
    await expect(loadSessionToolMappings(directory, "../other-session")).rejects.toThrow("session ID must be a non-empty slug");
    await expect(loadSessionToolMappings(directory, "session-1")).resolves.toEqual({});
  });
});
