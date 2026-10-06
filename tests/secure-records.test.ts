import { describe, expect, it } from "vitest";
import { canReadSecureRecord, parseActor, parseSecureRecord, recipientFromEnvironment, secureRecordPath } from "../src/secure-records.js";
import { assertIdentityOutsideRepository, defaultIdentityPath } from "../src/secure-setup.js";

describe("secure records", () => {
  it("uses safe record paths", () => {
    expect(secureRecordPath("/tmp/secure", "example-secure-record-2026")).toBe("/tmp/secure/example-secure-record-2026.md.age");
    expect(() => secureRecordPath("/tmp/secure", "../credentials")).toThrow("record id");
  });

  it("parses access metadata and preserves record content", () => {
    const record = parseSecureRecord(`---\naccess:\n  projects: [private-project-wiki]\n  business_lines: [example_line]\n---\n# Private record\n`);
    expect(record.metadata.access.projects).toEqual(["private-project-wiki"]);
    expect(record.body).toContain("Private record");
  });

  it("allows project and business-line matches but not unrelated projects", () => {
    const access = { projects: ["one"], business_lines: ["family"] };
    expect(canReadSecureRecord(access, { type: "project", name: "one", businessLines: [] })).toBe(true);
    expect(canReadSecureRecord(access, { type: "project", name: "two", businessLines: ["family"] })).toBe(true);
    expect(canReadSecureRecord(access, { type: "project", name: "two", businessLines: ["other"] })).toBe(false);
  });

  it("separates harness and shared access", () => {
    expect(canReadSecureRecord({ harness: true }, parseActor("harness"))).toBe(true);
    expect(canReadSecureRecord({ harness: true }, { type: "project", name: "one", businessLines: [] })).toBe(false);
    expect(canReadSecureRecord({ shared: true }, { type: "project", name: "one", businessLines: [] })).toBe(true);
  });

  it("requires explicit authorization for actor parsing", () => {
    expect(parseActor("project:private-project-wiki", ["family"])).toEqual({
      type: "project",
      name: "private-project-wiki",
      businessLines: ["family"],
    });
    expect(() => parseActor(undefined)).toThrow("actor is required");
  });

  it("keeps age identities outside the repository", () => {
    expect(defaultIdentityPath()).toContain(".config");
    expect(assertIdentityOutsideRepository("/tmp/harness-age-identity", "/repo/harness")).toBe("/tmp/harness-age-identity");
    expect(() => assertIdentityOutsideRepository("/repo/harness/.secure-documents/identity.txt", "/repo/harness")).toThrow("outside the harness repository");
  });

  it("reads dual-recipient write configuration without exposing a secret", () => {
    const previous = process.env.HARNESS_SECURE_AGE_RECIPIENTS;
    process.env.HARNESS_SECURE_AGE_RECIPIENTS = "age1primary, age1recovery";
    expect(recipientFromEnvironment()).toEqual(["age1primary", "age1recovery"]);
    if (previous === undefined) delete process.env.HARNESS_SECURE_AGE_RECIPIENTS;
    else process.env.HARNESS_SECURE_AGE_RECIPIENTS = previous;
  });

  it("rejects single-recipient write configuration", () => {
    const previous = process.env.HARNESS_SECURE_AGE_RECIPIENTS;
    process.env.HARNESS_SECURE_AGE_RECIPIENTS = "age1primary";
    expect(() => recipientFromEnvironment()).toThrow("primary and recovery");
    if (previous === undefined) delete process.env.HARNESS_SECURE_AGE_RECIPIENTS;
    else process.env.HARNESS_SECURE_AGE_RECIPIENTS = previous;
  });

  it("rejects duplicate recipients", () => {
    const previous = process.env.HARNESS_SECURE_AGE_RECIPIENTS;
    process.env.HARNESS_SECURE_AGE_RECIPIENTS = "age1same, age1same";
    expect(() => recipientFromEnvironment()).toThrow("distinct");
    if (previous === undefined) delete process.env.HARNESS_SECURE_AGE_RECIPIENTS;
    else process.env.HARNESS_SECURE_AGE_RECIPIENTS = previous;
  });
});
