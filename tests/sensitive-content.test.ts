import { describe, expect, it } from "vitest";
import { findSensitiveContent } from "../src/sensitive-content.js";

describe("findSensitiveContent", () => {
  it("detects common credentials and private keys", () => {
    const findings = findSensitiveContent([
      `+const apiKey = "${["super", "secret", "api-key-value"].join("-")}";`,
      `+service_role_key: ${"fake-token.".repeat(4)}`,
      `+description: ${["sb_secret", "r".repeat(22), "12345678"].join("_")}`,
      `+unlabeled: ${["eyJfakeheader", "eyJfakepayload", "fakesignature"].join(".")}`,
      `+${["-----BEGIN RSA", "PRIVATE KEY-----"].join(" ")}`,
    ].join("\n"));

    expect(findings.map(({ kind }) => kind)).toEqual(["credential", "credential", "credential", "credential", "private-key"]);
  });

  it("detects likely personal contact data while allowing public repository emails", () => {
    const findings = findSensitiveContent([
      `+contact: ${["jane.doe", "example.com"].join("@")}`,
      `+call me at ${["416", "555", "0199"].join("-")}`,
      "+remote: git@github.com:example/project.git",
    ].join("\n"));

    expect(findings.map(({ kind }) => kind)).toEqual(["email", "phone"]);
  });

  it("ignores removed lines from a staged diff", () => {
    expect(findSensitiveContent(`-const token = "${["old", "secret", "value"].join("-")}";`)).toEqual([]);
  });
});
