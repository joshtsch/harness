import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { createProjectsLocalProjection, mergeProjectsLocal, persistProjectsLocalRecord } from "../projects-local-projection.js";
import type { ArtifactContent } from "../continuation.js";

describe("projects.local portable projection", () => {
  it("keeps portable user metadata while excluding credentials and machine paths", () => {
    const source = `projects:\n  private-wiki:\n    remote: git@github.com:private-org/private-wiki.git\n    default_branch: trunk\n    setup_script: scripts/setup.sh\n    issue_tracker:\n      type: github\n      repository: private-org/private-wiki\n    tool_mappings:\n      calendar:\n        targets: [{ id: private-calendar-id, access: read }]\n`;
    const projection = createProjectsLocalProjection(source, Buffer.alloc(32, 9));
    expect(projection).toContain("private-wiki");
    expect(projection).toContain("private-org");
    expect(projection).toContain("private-calendar-id");
    const parsed = parse(projection);
    expect(parsed.projects["private-wiki"]).toMatchObject({
      remote: "git@github.com:private-org/private-wiki.git",
      default_branch: "trunk",
      issue_tracker: { type: "github", repository: "private-org/private-wiki" },
    });
  });

  it("filters credential-like and machine-specific fields recursively", () => {
    const result = createProjectsLocalProjection(`projects:\n  app:\n    remote: https://user:secret@example.com/repo.git?token=hidden#secret\n    local_path: /Users/private/app\n    location: /Users/private/repo\n    windows_path: C:\\Users\\private\\app\n    home_path: ~/private/app\n    unc_path: \\\\server\\share\\app\n    file_url: file:///Users/private/app\n    file_scheme: file:/Users/private/app\n    setup_script: scripts/setup.sh\n    api_token: private-token\n`, Buffer.alloc(32, 1));
    expect(result).toContain("https://example.com/repo.git");
    expect(result).not.toContain("hidden");
    expect(result).not.toContain("C:\\\\Users");
    expect(result).not.toContain("~/private");
    expect(result).not.toContain("server");
    expect(result).not.toContain("file_url");
    expect(result).not.toContain("file_scheme");
    expect(result).toContain("scripts/setup.sh");
    expect(result).not.toContain("secret");
    expect(result).not.toContain("/Users/private");
    expect(result).not.toContain("location");
    expect(result).not.toContain("api_token");
    expect(result).not.toContain("private-token");
  });

  it("filters camel-case API credentials as well as snake-case fields", () => {
    const result = createProjectsLocalProjection(`projects:\n  app:\n    apiKey: secret-api-key\n    serviceAccessKey: secret-access-key\n    machinePath: /machine/app\n    wiki_path: docs/wiki\n`, Buffer.alloc(32, 2));
    expect(result).not.toContain("apiKey");
    expect(result).not.toContain("secret-api-key");
    expect(result).not.toContain("serviceAccessKey");
    expect(result).not.toContain("secret-access-key");
    expect(result).not.toContain("machinePath");
    expect(result).toContain("wiki_path: docs/wiki");
  });

  it("filters Supabase service-role fields and credentials hidden in ordinary values", () => {
    const jwt = ["eyJfakeheader", "eyJfakepayload", "fakesignature"].join(".");
    const secretKey = ["sb_secret", "r".repeat(22), "12345678"].join("_");
    const result = createProjectsLocalProjection(`projects:\n  app:\n    service_role: ${"service-role-value"}\n    service_role_key: ${"service-role-key-value"}\n    serviceRoleKey: ${"camel-service-role-key"}\n    notes: ${jwt}\n    description: ${secretKey}\n`, Buffer.alloc(32, 4));
    expect(result).not.toContain("service_role:");
    expect(result).not.toContain("service_role_key:");
    expect(result).not.toContain("serviceRoleKey:");
    expect(result).not.toContain("service-role-value");
    expect(result).not.toContain("service-role-key-value");
    expect(result).not.toContain("camel-service-role-key");
    expect(result).not.toContain(jwt);
    expect(result).not.toContain(secretKey);
  });

  it("filters relative machine paths without removing portable wiki paths", () => {
    const result = createProjectsLocalProjection(`projects:\n  app:\n    projectPath: worktrees/app\n    project_root: projects/app\n    path: projects/app\n    cwd: .\n    wiki_path: docs/wiki\n`, Buffer.alloc(32, 3));
    expect(result).not.toContain("projectPath");
    expect(result).not.toContain("worktrees/app");
    expect(result).not.toContain("project_root");
    expect(result).not.toContain("path: projects/app");
    expect(result).not.toContain("cwd");
    expect(result).toContain("wiki_path: docs/wiki");
  });

  it("hydrates portable fields over local settings while preserving local-only fields", () => {
    const result = parse(mergeProjectsLocal(
      "projects:\n  app:\n    default_branch: trunk\n    issue_tracker:\n      repository: org/app\n",
      "projects:\n  app:\n    local_path: /machine/app\n    default_branch: main\n",
    ));
    expect(result.projects.app).toEqual({ default_branch: "trunk", issue_tracker: { repository: "org/app" }, local_path: "/machine/app" });
  });

  it("persists project configuration only as encrypted user-level content", async () => {
    let stored: { key: string; revision: number; content: ArtifactContent } | null = null;
    const revisions: Array<{ revision: number; content: ArtifactContent }> = [];
    const store = {
      loadUserRecord: async (key: string) => stored?.key === key ? { revision: stored.revision, content: stored.content } : null,
      commitUserRecord: async (key: string, expected: number | null, content: ArtifactContent) => {
        if ((stored?.revision ?? null) !== expected) throw new Error("revision conflict");
        const revision = (expected ?? 0) + 1;
        stored = { key, revision, content };
        revisions.push({ revision, content });
        return revision;
      },
    };
    const source = "projects:\n  private-project:\n    remote: git@github.com:private-org/private-project.git\n    local_path: /machine/private-project\n    api_token: do-not-store\n";
    const encrypt = async (plaintext: string) => ({ privacy: "encrypted" as const, ciphertext: Buffer.from(plaintext).toString("base64") });
    const revision = await persistProjectsLocalRecord(store, Buffer.alloc(32, 5), source, encrypt);
    expect(revision).toBe(1);
    expect(JSON.stringify(stored)).not.toContain("private-project");
    const decrypted = Buffer.from(stored!.content.ciphertext, "base64").toString("utf8");
    expect(decrypted).toContain("private-project");
    expect(decrypted).not.toContain("/machine/private-project");
    expect(decrypted).not.toContain("do-not-store");
    expect(revisions).toHaveLength(1);
  });

  it("rejects invalid configuration and weak key material", () => {
    expect(() => createProjectsLocalProjection("not: [valid", Buffer.alloc(32))).toThrow("valid YAML");
    expect(() => createProjectsLocalProjection("projects: {}", Buffer.alloc(8))).toThrow("at least 32 bytes");
  });
});
