import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const hook = resolve("scripts/claude-hooks/secret-command-guard.mjs");
const run = (command: string) =>
  spawnSync(process.execPath, [hook], { input: JSON.stringify({ tool_input: { command } }), encoding: "utf8" });

describe("secret command guard", () => {
  it.each([
    "bw get notes hcp-inputs",
    "bw unlock --raw",
    "bw",
    "/opt/homebrew/bin/bw list items",
    "cd x && bw export",
    "bw get notes hcp-inputs | node --import tsx scripts/hcp-projects.ts plan --variables-file -",
    "pnpm hcp:projects plan",
    "pnpm run hcp:projects apply",
    "node --env-file=.env --import tsx scripts/hcp-projects.ts plan",
    'sh -c "bw get password x"',
    "BW_SESSION=x bw list items",
    "export S=$(bw unlock --raw)",
    "env FOO=1 bw sync",
  ])("blocks %s and sends the user to their own terminal", (command) => {
    const result = run(command);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("run the command themselves in a separate terminal");
  });

  it.each([
    "bw status",
    "bw --help",
    "git commit -m 'bwrap'",
    "git commit -m 'feat: block bw (except status) and hcp:projects'",
    "echo bw get",
    "pnpm hcp:projects-docs",
    "git add scripts/hcp-projects.ts src/x.ts",
    "vitest run src/__tests__/hcp-projects-cli.test.ts",
  ])(
    "allows %s",
    (command) => expect(run(command).status).toBe(0),
  );
});
