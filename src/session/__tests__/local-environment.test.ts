import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadProjectConfigEnvironment } from "../local-environment.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("loadProjectConfigEnvironment", () => {
  it("loads .env values for configuration without mutating process environment", async () => {
    const directory = await mkdtemp(join(tmpdir(), "harness-env-"));
    temporaryDirectories.push(directory);
    await writeFile(join(directory, ".env"), "LOCAL_TARGET_ID=local-target\nUNRELATED_ENV_VALUE=fixture-value\n");
    const processEnvironment = { LOCAL_TARGET_ID: "process-target" };
    const originalValue = process.env.UNRELATED_ENV_VALUE;

    await expect(loadProjectConfigEnvironment(directory, processEnvironment)).resolves.toEqual({
      LOCAL_TARGET_ID: "process-target",
      UNRELATED_ENV_VALUE: "fixture-value",
    });
    expect(process.env.UNRELATED_ENV_VALUE).toBe(originalValue);
  });

  it("uses process values when the local .env file is absent", async () => {
    const directory = await mkdtemp(join(tmpdir(), "harness-env-"));
    temporaryDirectories.push(directory);

    await expect(loadProjectConfigEnvironment(directory, { EXISTING_TARGET_ID: "process-target" })).resolves.toEqual({
      EXISTING_TARGET_ID: "process-target",
    });
  });
});
