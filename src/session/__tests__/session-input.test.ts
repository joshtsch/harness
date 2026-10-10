import { describe, expect, it } from "vitest";
import { parseSessionArgs } from "../index.js";

describe("parseSessionArgs", () => {
  it("parses issue-bound sessions", () => {
    expect(parseSessionArgs(["--goal", "Prove session setup", "example-project", "11"])).toEqual({ projectList: "example-project", issueKey: "11", goal: "Prove session setup" });
  });

  it("requires a real issue number", () => {
    expect(() => parseSessionArgs(["--goal", "Prove session setup", "example-project", "not-an-issue"])).toThrow("issue number");
    expect(() => parseSessionArgs(["--goal", "Prove session setup", "example-project", "0"])).toThrow("canonical positive");
    expect(() => parseSessionArgs(["--goal", "Prove session setup", "example-project", "011"])).toThrow("canonical positive");
    expect(() => parseSessionArgs(["--goal", "Prove session setup", "example-project", "--exploratory", "upgrade-deps"])).toThrow("open a tracker issue");
    expect(() => parseSessionArgs(["--goal", "Prove session setup", "example-project", "11", "extra"])).toThrow("Usage:");
    expect(() => parseSessionArgs(["--goal", "Prove session setup", "--refresh", "example-project", "11", "--refresh"])).toThrow("Usage:");
  });

  it("requires one explicit, bounded goal before session setup", () => {
    for (const args of [["example-project", "11"], ["--goal", "", "example-project", "11"], ["--goal", "first", "--goal", "second", "example-project", "11"]]) expect(() => parseSessionArgs(args)).toThrow();
    for (const goal of ["two\nlines", "ends with newline\n", "x".repeat(1001)]) expect(() => parseSessionArgs(["--goal", goal, "example-project", "11"])).toThrow("goal must be one");
    expect(() => parseSessionArgs(["--goal", ["token=", "abcdefghijklmnop"].join(""), "example-project", "11"])).toThrow("likely secrets or PII");
  });
});
