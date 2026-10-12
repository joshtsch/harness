import { execFile } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const exec = promisify(execFile);
const repoRoot = resolve(import.meta.dirname, "..");
type CliResult = {
  status: string;
  sessionKey?: string;
  revision?: number;
  nextTodo?: { id: string };
  checkpointFile?: string;
};

describe("continuation todos CLI", () => {
  it("saves, updates, resumes, and updates a claimed checkpoint", async () => {
    const root = await mkdtemp(join(tmpdir(), "harness-continuation-todos-"));
    try {
      const bin = join(root, "bin");
      await mkdir(bin);
      const agePath = join(bin, "age");
      await writeFile(agePath, `#!/usr/bin/env node
let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => { input += chunk; });
process.stdin.on("end", () => {
  if (process.argv.includes("-d")) {
    const payload = input.split(/\\r?\\n/)[1] ?? "";
    process.stdout.write(Buffer.from(payload, "base64").toString("utf8"));
  } else {
    process.stdout.write("-----BEGIN AGE ENCRYPTED FILE-----\\n" + Buffer.from(input).toString("base64") + "\\n");
  }
});
`);
      await chmod(agePath, 0o755);

      const statePath = join(root, "state.json");
      const mockFetch = `import { readFileSync, writeFileSync } from "node:fs";
const path = process.env.HARNESS_TEST_STATE_FILE;
const load = () => { try { return JSON.parse(readFileSync(path, "utf8")); } catch { return { manifest: null, artifacts: {} }; } };
globalThis.fetch = async (input, init) => {
  const name = String(input).split("/").at(-1);
  const body = JSON.parse(String(init?.body ?? "{}"));
  const state = load();
  if (name === "continuation_load") return Response.json(state.manifest);
  if (name === "continuation_read_artifact") return Response.json(state.artifacts[body.p_artifact_key] ?? null);
  if (name === "continuation_commit") {
    if (body.p_expected_revision !== (state.manifest?.revision ?? null)) return Response.json({ code: "40001" }, { status: 400 });
    state.manifest = body.p_manifest;
    for (const artifact of body.p_artifacts) state.artifacts[artifact.key] = artifact;
    writeFileSync(path, JSON.stringify(state));
    return Response.json(state.manifest);
  }
  throw new Error("unexpected continuation request");
};`;
      const mockFetchImport = `data:text/javascript,${encodeURIComponent(mockFetch)}`;
      const env = {
        ...process.env,
        PATH: `${bin}:${process.env.PATH ?? ""}`,
        HARNESS_TEST_STATE_FILE: statePath,
        HARNESS_CONTINUATION_SUPABASE_URL: "https://continuation.example",
        HARNESS_CONTINUATION_SUPABASE_SERVICE_ROLE_KEY: "fixture-service-key",
        HARNESS_CONTINUATION_KEY_BASE64: Buffer.alloc(32, 7).toString("base64"),
        HARNESS_SECURE_AGE_RECIPIENTS: "age1primary,age1recovery",
        HARNESS_SECURE_AGE_IDENTITY: join(root, "identity.txt"),
      };
      const run = async (...args: string[]) => {
        const result = await exec(process.execPath, [
          "--import", createRequire(import.meta.url).resolve("tsx"),
          "--import", mockFetchImport,
          resolve(repoRoot, "scripts/continuation.ts"),
          ...args,
        ], { cwd: repoRoot, env });
        return JSON.parse(result.stdout) as CliResult;
      };

      const handoffPath = join(root, "handoff.md");
      const todosPath = join(root, "todos.json");
      await writeFile(handoffPath, "Continue the session safely.\n");
      await writeFile(todosPath, JSON.stringify([
        { id: "review", title: "Review the issue", status: "open" },
        { id: "implement", title: "Implement the change", status: "open" },
      ]));

      const saved = await run("save", "--handoff", handoffPath, "--todos", todosPath);
      expect(saved).toMatchObject({ status: "saved", nextTodo: { id: "review" } });
      const savedState = JSON.parse(await readFile(statePath, "utf8")) as {
        manifest: { latest: Record<string, number> };
        artifacts: Record<string, { kind: string; privacy: string }>;
      };
      expect(Object.keys(savedState.manifest.latest)).toHaveLength(2);
      expect(Object.values(savedState.artifacts).map(({ kind }) => kind).sort()).toEqual(["handoff", "todos"]);
      expect(Object.values(savedState.artifacts)).toEqual(expect.arrayContaining([
        expect.objectContaining({ kind: "todos", privacy: "encrypted" }),
      ]));
      expect(saved.sessionKey).toMatch(/^sessions\/[0-9a-f]{64}$/);

      await writeFile(todosPath, JSON.stringify([
        { id: "review", title: "Review the issue", status: "completed" },
        { id: "implement", title: "Implement the change", status: "open" },
      ]));
      const updated = await run("todos", "--session-key", saved.sessionKey!, "--todos", todosPath);
      expect(updated).toMatchObject({ status: "saved", revision: 2, nextTodo: { id: "implement" } });

      const resumed = await run("resume", "--session-key", saved.sessionKey!);
      expect(resumed).toMatchObject({ status: "claimed", nextTodo: { id: "implement" } });
      expect(resumed.checkpointFile).toEqual(expect.any(String));
      const checkpointPath = resumed.checkpointFile!;
      expect(await readFile(checkpointPath, "utf8")).toContain("-----BEGIN AGE ENCRYPTED FILE-----");

      await writeFile(todosPath, JSON.stringify([
        { id: "review", title: "Review the issue", status: "completed" },
        { id: "implement", title: "Implement the change", status: "completed" },
      ]));
      const completed = await run("todos", "--checkpoint-file", checkpointPath, "--todos", todosPath);
      expect(completed).toMatchObject({ status: "saved", revision: 4 });
      await expect(readFile(checkpointPath)).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }, 30_000);
});
