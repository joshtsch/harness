import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parse } from "yaml";
import { backupProjectConfig } from "../src/project-config-sync.js";
import { saveProviderAccountChange, setProviderAccount } from "../src/provider-account-edit.js";

vi.mock("../src/project-config-sync.js", () => ({ backupProjectConfig: vi.fn() }));
const backup = vi.mocked(backupProjectConfig);

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

  it("leaves untouched entries byte-identical", () => {
    const withOther = `${local}  storage:\n    plan: paid\n    categories: [object-storage, backups]\n`;
    expect(setProviderAccount(withOther, "mail", { plan: "paid" }).source).toContain("  storage:\n    plan: paid\n    categories: [object-storage, backups]\n");
  });

  it("treats a bare provider_accounts key as empty", () => {
    const result = setProviderAccount("provider_accounts:\n", "storage", { plan: "paid", categories: ["backups"] });
    expect(parse(result.source)).toEqual({ provider_accounts: { storage: { plan: "paid", categories: ["backups"] } } });
  });

  it("rejects a provider_accounts value that is not a mapping", () => {
    expect(() => setProviderAccount("provider_accounts: [a]\n", "storage", { plan: "paid", categories: ["backups"] })).toThrow("must be a mapping");
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

describe("saveProviderAccountChange", () => {
  let dir: string;
  let localPath: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "accounts-test-"));
    localPath = join(dir, "projects.local.yml");
    backup.mockReset();
  });
  afterEach(() => rm(dir, { recursive: true, force: true }));

  it("writes the file and replaces the encrypted backup", async () => {
    backup.mockResolvedValue();
    expect(await saveProviderAccountChange("projects.yml", localPath, local, false)).toEqual({ backup: "updated" });
    expect(await readFile(localPath, "utf8")).toBe(local);
    expect(backup).toHaveBeenCalledWith("projects.yml", localPath, true);
  });

  it("keeps the local write when the backup fails", async () => {
    backup.mockRejectedValue(new Error("vault is locked"));
    const result = await saveProviderAccountChange("projects.yml", localPath, local, false);
    expect(result).toMatchObject({ backup: "failed", error: { message: "vault is locked" } });
    expect(await readFile(localPath, "utf8")).toBe(local);
  });

  it("skips the backup on request", async () => {
    expect(await saveProviderAccountChange("projects.yml", localPath, local, true)).toEqual({ backup: "skipped" });
    expect(backup).not.toHaveBeenCalled();
  });
});
