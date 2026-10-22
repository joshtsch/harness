import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("HCP project onboarding CLI", () => {
  it("plans the merged Terraform project list without applying", () => {
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
        env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, TF_VAR_tfe_organization: "synthetic", HCP_TEST_LOG: log, HCP_TEST_VARS: resolve("infrastructure/hcp/onboarding.auto.tfvars") },
      });
      expect(result.status).toBe(0);
      const calls = readFileSync(log, "utf8");
      expect(calls).toContain(" init ");
      expect(calls).toContain(" plan -input=false");
      expect(calls).toContain('project_workspace_names = ["app-infrastructure"]');
      expect(calls).toContain('project_workspace_organizations = {"app-infrastructure":"app-isolated"}');
      expect(calls).toContain('project_organization_names = ["app-isolated"]');
      expect(calls).not.toContain(" apply");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
