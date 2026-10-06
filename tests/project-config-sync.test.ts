import { describe, expect, it } from "vitest";
import { projectConfigFromRecord, projectConfigRecordSource } from "../src/project-config-sync.js";

describe("project configuration secure sync", () => {
  it("wraps local configuration in harness-scoped secure-record metadata", () => {
    const source = projectConfigRecordSource("projects:\n  example: {}\n");
    expect(source).toContain("access:\n  harness: true");
    expect(projectConfigFromRecord(source)).toBe("projects:\n  example: {}\n");
  });

  it("rejects empty local configuration", () => {
    expect(() => projectConfigRecordSource(" \n")).toThrow("empty");
  });
});
