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

  it("does not treat ISO dates as phone numbers", () => {
    const date = (day: string) => ["2026", "03", day].join("-");
    const findings = findSensitiveContent([
      `+## ${date("18")}`,
      `+version_date: "${date("18")}"`,
      `+(${date("18")} ${date("19")})`,
      `+call ${["416", "555", "0199"].join("-")} on ${date("18")}`,
    ].join("\n"));

    expect(findings.map(({ match }) => match)).toEqual([["416", "555", "0199"].join("-")]);
  });

  it("does not treat dotted versions or SVG viewBox values as phone numbers", () => {
    const version = ["1", "0", "30001826"].join(".");
    const findings = findSensitiveContent([
      `+  caniuse-lite@${version}:`,
      `+    version: ${version}`,
      `+<svg viewBox="${["0", "0", "200", "120"].join(" ")}">`,
    ].join("\n"));

    expect(findings).toEqual([]);
  });

  it("still flags common phone formats", () => {
    const phones = [
      `+1 (415) ${["555", "0172"].join("-")}`,
      ["415", "555", "0172"].join("-"),
      ["415", "555", "0172"].join("."),
      ["+44", "20", "7946", "0958"].join(" "),
      ["415", "555", "0172"].join(""),
    ];
    const findings = findSensitiveContent(phones.map((phone) => `+call ${phone}.`).join("\n"));

    expect(findings.map(({ match }) => match)).toEqual(phones);
  });

  it("ignores removed lines from a staged diff", () => {
    expect(findSensitiveContent(`-const token = "${["old", "secret", "value"].join("-")}";`)).toEqual([]);
  });
});
