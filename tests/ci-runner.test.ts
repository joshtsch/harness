import { execFile } from "node:child_process";
import { chmod, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { expect, it } from "vitest";

const exec = promisify(execFile);

async function runWithVisibility(visibility: string, action = "start") {
  const bin = await mkdtemp(join(tmpdir(), "ci-runner-"));
  await writeFile(join(bin, "gh"), `#!/bin/sh\necho "$*" >> "${bin}/calls"\n[ "$1" = repo ] && echo ${visibility}\n[ "$2" = repos/example/fixture/actions/runners ] && echo 42\nexit 0\n`);
  await writeFile(join(bin, "docker"), `#!/bin/sh\necho "docker $*" >> "${bin}/calls"\nexit 1\n`);
  await chmod(join(bin, "gh"), 0o755);
  await chmod(join(bin, "docker"), 0o755);
  return exec("bash", ["scripts/ci-runner.sh", action, "example/fixture"], { env: { ...process.env, PATH: `${bin}:${process.env.PATH}` } })
    .then(() => ({ code: 0, stderr: "", bin }), (error: { code: number; stderr: string }) => ({ code: error.code, stderr: error.stderr, bin }));
}

it("refuses to register a runner for a public repository", async () => {
  const result = await runWithVisibility("PUBLIC");
  expect(result.code).toBe(1);
  expect(result.stderr).toContain("private repositories only");
  expect(await readFile(join(result.bin, "calls"), "utf8")).not.toMatch(/registration-token|docker/);
});

it("rejects malformed arguments before calling GitHub", async () => {
  await expect(exec("bash", ["scripts/ci-runner.sh", "start", "not a repo"])).rejects.toMatchObject({ code: 2 });
  await expect(exec("bash", ["scripts/ci-runner.sh", "start", "example/fixture", "--privileged"])).rejects.toMatchObject({ code: 2 });
});

it("removes the runner from a repository that turned public, deleting it through the API when the container is gone", async () => {
  const result = await runWithVisibility("PUBLIC", "stop");
  expect(result.code).toBe(0);
  expect(await readFile(join(result.bin, "calls"), "utf8")).toMatch(/-X DELETE repos\/example\/fixture\/actions\/runners\/42/);
});
