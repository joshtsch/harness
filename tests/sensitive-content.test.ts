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

  it("allows valid public dates and research identifiers while retaining adjacent phones", () => {
    const publicText = [
      "+Submitted 2026-03-17; revised 2026-03-18 11:30:46 UTC.",
      "+arXiv:2603.16021; https://arxiv.org/html/2603.16021v2",
      "+https://doi.org/10.48550/arXiv.2603.16021",
    ].join("\n");
    expect(findSensitiveContent(publicText)).toEqual([]);
    const phone = ["416", "555", "0199"].join("-");
    expect(findSensitiveContent(`${publicText}\n+2026-10-28 call ${phone}`).map(({ kind }) => kind)).toEqual(["phone"]);
    expect(findSensitiveContent(`+https://example.com/${phone}`).map(({ kind }) => kind)).toEqual(["phone"]);
    expect(findSensitiveContent(`+${[2026, 13, 17].join("-")}`).map(({ kind }) => kind)).toEqual(["phone"]);
  });

  it("scans added content resembling a diff header and tolerates Git filename escapes", () => {
    const value = ["synthetic", "credential", "value"].join("-");
    const diff = `diff --git a/a.md b/a.md\n+++ b/a.md\n@@ -0,0 +1 @@\n+++ token: ${value}`;
    expect(findSensitiveContent(diff).map(({ kind }) => kind)).toEqual(["credential"]);
    expect(() => findSensitiveContent(`+++ "b/\\303\\251.md"\n@@ -0,0 +1 @@\n+token: ${value}`)).not.toThrow();
  });

  it("tracks safe diagnostic locations across files and diff hunks", () => {
    const phone = ["416", "555", "0199"].join("-");
    const findings = findSensitiveContent(`diff --git a/notes.md b/notes.md\n+++ b/notes.md\n@@ -0,0 +8,2 @@\n+safe\n+${phone}\ndiff --git a/other.md b/other.md\n+++ b/other.md\n@@ -4,1 +6,1 @@\n-old\n+${phone}`);
    expect(findings.map(({ file, line }) => ({ file, line }))).toEqual([{ file: "notes.md", line: 9 }, { file: "other.md", line: 6 }]);
  });
});
