import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { setProviderAccount } from "../src/provider-account-edit.js";

const local = `# local overlay
provider_accounts:
  # existing mail account
  mail:
    plan: free
    categories: [email]
    business_line: example-line
    notes: 3k per month
`;

describe("setProviderAccount", () => {
  it("adds a new account to an empty file", () => {
    const result = setProviderAccount("", "storage", { plan: "paid", categories: ["object-storage"] });
    expect(result.status).toBe("added");
    expect(parse(result.source)).toEqual({ provider_accounts: { storage: { plan: "paid", categories: ["object-storage"] } } });
  });

  it("requires plan and categories for a new account", () => {
    expect(() => setProviderAccount(local, "storage", { plan: "paid" })).toThrow("--plan and --categories");
  });

  it("merges changes and keeps omitted fields and comments", () => {
    const result = setProviderAccount(local, "mail", { plan: "paid" });
    expect(result.status).toBe("changed");
    expect(result.entry).toEqual({ plan: "paid", categories: ["email"], business_line: "example-line", notes: "3k per month" });
    expect(result.source).toContain("# local overlay");
    expect(result.source).toContain("# existing mail account");
  });

  it("replaces the category list", () => {
    expect(setProviderAccount(local, "mail", { categories: ["email", "crm"] }).entry.categories).toEqual(["email", "crm"]);
  });

  it("clears business line and notes", () => {
    const { entry } = setProviderAccount(local, "mail", { personal: true, clearNotes: true });
    expect(entry).toEqual({ plan: "free", categories: ["email"] });
  });

  it("reports unchanged when nothing differs", () => {
    expect(setProviderAccount(local, "mail", { plan: "free" }).status).toBe("unchanged");
  });

  it("rejects conflicting flags", () => {
    expect(() => setProviderAccount(local, "mail", { personal: true, businessLine: "x" })).toThrow("conflicts");
    expect(() => setProviderAccount(local, "mail", { clearNotes: true, notes: "x" })).toThrow("conflicts");
  });
});
