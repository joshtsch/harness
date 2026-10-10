import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { installedPluginNames, missingRequiredPlugins, verifyRequiredPlugins } from "../src/codex-plugins.js";

const required = [{ name: "fixture", marketplace: "local", source: "example/fixture", install: ["codex plugin add fixture@local"] }];
const directories: string[] = [];
async function syntheticCodex(source: string): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), "harness-plugin-test-"));
  directories.push(directory);
  await writeFile(join(directory, "codex"), `#!/usr/bin/env node\n${source}\n`, { mode: 0o755 });
  vi.stubEnv("PATH", `${directory}${delimiter}${process.env.PATH ?? ""}`);
}

afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("Codex plugin checks", () => {
  it("parses installed and enabled plugins from codex output", () => {
    const names = installedPluginNames("ponytail@ponytail installed, enabled  4.10.0\nother@market not installed");
    expect(names).toEqual(new Set(["ponytail@ponytail"]));
  });

  it("reports only required plugins that are unavailable", () => {
    const required = [
      { name: "ponytail", marketplace: "ponytail", source: "DietrichGebert/ponytail", install: [] },
      { name: "missing", marketplace: "local", source: "example/missing", install: [] },
    ];
    expect(missingRequiredPlugins(required, "ponytail@ponytail installed, enabled").map((plugin) => plugin.name)).toEqual(["missing"]);
  });

  it.each(["stdout", "stderr"])("verifies a synthetic inventory above 1 MiB on %s", async (stream) => {
    await syntheticCodex(`process.${stream}.write("x".repeat(2 * 1024 * 1024) + "\\nfixture@local installed, enabled\\n");`);
    await expect(verifyRequiredPlugins(required)).resolves.toBeUndefined();
  });

  it("still refuses missing plugins and provides installation guidance", async () => {
    await syntheticCodex('process.stdout.write("x".repeat(2 * 1024 * 1024));');
    await expect(verifyRequiredPlugins(required)).rejects.toThrow("codex plugin add fixture@local");
  });

  it("reports command failure without reproducing inventory or diagnostic content", async () => {
    await syntheticCodex('process.stderr.write("PRIVATE_PLUGIN_DETAIL", () => process.exit(7));');
    const error = await verifyRequiredPlugins(required).catch((failure: unknown) => failure);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain("exited with status 7");
    expect((error as Error).message).not.toContain("PRIVATE_PLUGIN_DETAIL");
  });

  it("refuses inventories beyond the bounded capture limit", async () => {
    await syntheticCodex('process.stdout.write("x".repeat(9 * 1024 * 1024));');
    await expect(verifyRequiredPlugins(required)).rejects.toThrow("inventory exceeds the 8 MiB per-stream capture limit");
  });
});
