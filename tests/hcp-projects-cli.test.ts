import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("HCP project onboarding CLI", () => {
  it.each(["absent", "ordinary", "template"])("plans without applying and forwards contacts safely: %s", (kind) => {
    const withContacts = kind !== "absent";
    const contacts = { "app-isolated": [kind === "template" ? "private${@}contact%{marker}" : "operations", "example.invalid"].join("@") };
    const root = mkdtempSync(join(tmpdir(), "harness-hcp-cli-test-"));
    try {
      const config = join(root, "config");
      const bin = join(root, "bin");
      const log = join(root, "terraform.log");
      mkdirSync(config);
      mkdirSync(bin);
      writeFileSync(join(config, "projects.yml"), "defaults:\n  default_branch: main\n  setup_script: scripts/setup.sh\n  issue_tracker:\n    type: github\nprojects: {}\n");
      writeFileSync(join(config, "projects.local.yml"), "projects:\n  app:\n    remote: git@github.com:example/app.git\n    hcp_workspace: app-infrastructure\n    hcp_organization: app-isolated\n");
      writeFileSync(join(bin, "terraform"), "#!/bin/sh\nprintf '%s\\n' \"$*\" >> \"$HCP_TEST_LOG\"\nif [ \"$2\" = plan ]; then cat \"$HCP_TEST_VARS\" >> \"$HCP_TEST_LOG\"; fi\n", { mode: 0o700 });

      const result = spawnSync(process.execPath, ["--import", "tsx", "scripts/hcp-projects.ts", "plan", "--config-root", config], {
        cwd: resolve("."),
        encoding: "utf8",
        env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, TF_VAR_tfe_organization: "synthetic", TF_VAR_project_organization_admin_emails: withContacts ? JSON.stringify(contacts) : "", HCP_TEST_LOG: log, HCP_TEST_VARS: resolve("infrastructure/hcp/onboarding.auto.tfvars") },
      });
      expect(result.status).toBe(0);
      const calls = readFileSync(log, "utf8");
      expect(calls).toContain(" init ");
      expect(calls).toContain(" plan -input=false");
      expect(calls).toContain('project_workspace_names = ["app-infrastructure"]');
      expect(calls).toContain('project_workspace_organizations = {"app-infrastructure":"app-isolated"}');
      expect(calls).toContain('project_organization_names = ["app-isolated"]');
      expect(calls).not.toContain(" apply");
      expect(calls.includes("project_organization_admin_emails =")).toBe(withContacts);
      if (kind === "ordinary") expect(calls).toContain(`project_organization_admin_emails = ${JSON.stringify(contacts)}`);
      if (kind === "template") {
        expect(calls).toContain("private$${@}contact%%{marker}");
        expect(calls).not.toContain("private${@}contact%{marker}");
      }
      expect(result.stdout + result.stderr).not.toContain(contacts["app-isolated"]);
      expect(existsSync(resolve("infrastructure/hcp/onboarding.auto.tfvars"))).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it.each(["unparseable-private-input", "null", "[]", '{"app-isolated":42}'])("rejects malformed contacts without echoing the input: %s", (input) => {
    const result = spawnSync(process.execPath, ["--import", "tsx", "scripts/hcp-projects.ts", "plan"], {
      cwd: resolve("."), encoding: "utf8",
      env: { ...process.env, TF_VAR_tfe_organization: "synthetic", TF_VAR_project_organization_admin_emails: input },
    });
    expect(result.status).toBe(1);
    expect(result.stderr.trim()).toBe("TF_VAR_project_organization_admin_emails must be a JSON object of nonempty strings");
    expect(result.stdout + result.stderr).not.toContain(input);
    expect(existsSync(resolve("infrastructure/hcp/onboarding.auto.tfvars"))).toBe(false);
  });
});
