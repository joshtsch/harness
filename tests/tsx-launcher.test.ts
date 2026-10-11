import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const repoRoot = resolve(import.meta.dirname, "..");

describe("TypeScript package script launchers", () => {
  it("uses Node's tsx preload and preserves the continuation list's safe projection", async () => {
    const packageJson = JSON.parse(await readFile(resolve(repoRoot, "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };
    const tsxCliScripts = Object.entries(packageJson.scripts)
      .filter(([, command]) => /^tsx\\s/.test(command));
    expect(tsxCliScripts).toEqual([]);
    expect(packageJson.scripts["secure:rotate"]).toBe("node --import tsx scripts/secure-rotate.ts");

    const listCommand = packageJson.scripts["continuation:list"];
    expect(listCommand).toBe("node --import tsx scripts/continuation.ts list");
    const [runtime, preloadFlag, preload, entrypoint, ...arguments_] = listCommand.split(" ");
    expect([runtime, preloadFlag, preload, entrypoint]).toEqual([
      "node",
      "--import",
      "tsx",
      "scripts/continuation.ts",
    ]);

    const serviceKey = "fixture-key";
    const artifactContent = "PRIVATE_ARTIFACT_CONTENT_MARKER";
    const privateEventValue = "PRIVATE_EVENT_VALUE_MARKER";
    const mockFetch = `globalThis.fetch = async (input, init) => {
      if (String(input) !== "https://continuation.example/rest/v1/rpc/continuation_list") {
        throw new Error("unexpected continuation request");
      }
      const headers = new Headers(init?.headers);
      if (headers.get("apikey") !== "fixture-key") throw new Error("unexpected API key");
      if (JSON.parse(String(init?.body)).p_state !== "active") throw new Error("unexpected list state");
      return new Response(JSON.stringify([{
        key: "sessions/test",
        state: "active",
        revision: 7,
        latest: { handoff: 1 },
        events: [{ type: "saved", at: "2026-10-10T00:00:00.000Z", actor: "PRIVATE_EVENT_VALUE_MARKER" }],
        artifactContents: "PRIVATE_ARTIFACT_CONTENT_MARKER"
      }]), { status: 200, headers: { "content-type": "application/json" } });
    };`;
    const mockFetchImport = `data:text/javascript,${encodeURIComponent(mockFetch)}`;
    const { stdout } = await execFileAsync(process.execPath, [
      preloadFlag,
      preload,
      "--import",
      mockFetchImport,
      entrypoint,
      ...arguments_,
    ], {
      cwd: repoRoot,
      env: {
        ...process.env,
        HARNESS_CONTINUATION_SUPABASE_URL: "https://continuation.example",
        HARNESS_CONTINUATION_SUPABASE_SERVICE_ROLE_KEY: serviceKey,
      },
    });

    expect(JSON.parse(stdout)).toEqual([{
      sessionKey: "sessions/test",
      state: "active",
      revision: 7,
      artifactCount: 1,
      lastEvent: "saved",
    }]);
    expect(stdout).not.toContain(artifactContent);
    expect(stdout).not.toContain(privateEventValue);
    expect(stdout).not.toContain(serviceKey);
  });
});
