import { describe, expect, it } from "vitest";
import { parseSessionArgs } from "../index.js";

describe("parseSessionArgs", () => {
  it("parses issue-bound sessions", () => {
    expect(parseSessionArgs(["example-project", "11"])).toEqual({ projectList: "example-project", issueKey: "11" });
  });

  it("requires a real issue number", () => {
    expect(() => parseSessionArgs(["example-project", "not-an-issue"])).toThrow("issue number");
    expect(() => parseSessionArgs(["example-project", "0"])).toThrow("canonical positive");
    expect(() => parseSessionArgs(["example-project", "011"])).toThrow("canonical positive");
    expect(() => parseSessionArgs(["example-project", "--exploratory", "upgrade-deps"])).toThrow("open a tracker issue");
    expect(() => parseSessionArgs(["example-project", "11", "extra"])).toThrow("Usage:");
    expect(() => parseSessionArgs(["--refresh", "example-project", "11", "--refresh"])).toThrow("Usage:");
  });
});
