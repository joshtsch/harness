import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadHarnessConfig, providerAccountsForProject, selectProviderAccounts } from "../project-config.js";

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

const base = [
  "defaults:",
  "  default_branch: main",
  "  setup_script: scripts/setup.sh",
  "  issue_tracker:",
  "    type: github",
  "business_lines:",
  "  sales:",
  "    display_name: Sales",
  "  support:",
  "    display_name: Support",
  "projects:",
  "  personal-app:",
  "    remote: git@github.com:example/personal-app.git",
  "  sales-app:",
  "    remote: git@github.com:example/sales-app.git",
  "    business_lines: [sales]",
];

async function load(publicLines: string[], localLines: string[]) {
  const directory = await mkdtemp(join(tmpdir(), "harness-accounts-"));
  directories.push(directory);
  await writeFile(join(directory, "projects.yml"), publicLines.join("\n"));
  await writeFile(join(directory, "projects.local.yml"), localLines.join("\n"));
  return loadHarnessConfig(join(directory, "projects.yml"));
}

const accounts = [
  "provider_accounts:",
  "  object-store:",
  "    plan: paid",
  "    categories: [object-storage, backups]",
  "    notes: Existing bucket",
  "  database-host:",
  "    plan: free",
  "    categories: [database, auth, object-storage]",
  "  sales-hosting:",
  "    plan: paid",
  "    categories: [hosting]",
  "    business_line: sales",
  "  support-email:",
  "    plan: paid",
  "    categories: [email]",
  "    business_line: support",
];

describe("provider accounts", () => {
  it("loads accounts from the local overlay", async () => {
    const config = await load(base, accounts);
    expect(config.providerAccounts).toEqual([
      { name: "object-store", plan: "paid", categories: ["object-storage", "backups"], notes: "Existing bucket" },
      { name: "database-host", plan: "free", categories: ["database", "auth", "object-storage"] },
      { name: "sales-hosting", plan: "paid", categories: ["hosting"], businessLine: "sales" },
      { name: "support-email", plan: "paid", categories: ["email"], businessLine: "support" },
    ]);
  });

  it("scopes accounts to personal plus the project's business lines", async () => {
    const { projects, providerAccounts } = await load(base, accounts);
    const names = (project: string) => providerAccountsForProject(providerAccounts, projects[project]!).map(({ name }) => name);
    expect(names("personal-app")).toEqual(["object-store", "database-host"]);
    expect(names("sales-app")).toEqual(["object-store", "database-host", "sales-hosting"]);
  });

  it("selects accounts by project and category, rejecting unknown projects", async () => {
    const config = await load(base, accounts);
    const names = (filter: Parameters<typeof selectProviderAccounts>[1]) => selectProviderAccounts(config, filter).map(({ name }) => name);
    expect(names({})).toEqual(["object-store", "database-host", "sales-hosting", "support-email"]);
    expect(names({ category: "object-storage" })).toEqual(["object-store", "database-host"]);
    expect(names({ project: "sales-app", category: "hosting" })).toEqual(["sales-hosting"]);
    expect(names({ project: "personal-app", category: "hosting" })).toEqual([]);
    expect(() => selectProviderAccounts(config, { project: "missing" })).toThrow("Unknown project");
  });

  it("treats a missing provider_accounts key as empty", async () => {
    await expect(load(base, ["{}"])).resolves.toMatchObject({ providerAccounts: [] });
  });

  it("rejects provider accounts in the public configuration", async () => {
    await expect(load([...base, ...accounts], ["{}"])).rejects.toThrow("move it from projects.yml to projects.local.yml");
  });

  it.each([
    [["    plan: monthly", "    categories: [email]"], "provider_accounts.bad.plan must be paid or free"],
    [["    plan: paid", "    categories: [mail]"], "provider_accounts.bad.categories contains unknown category mail"],
    [["    plan: paid", "    categories: []"], "provider_accounts.bad.categories must not be empty"],
    [["    plan: paid"], "provider_accounts.bad.categories must not be empty"],
    [["    plan: paid", "    categories: [email, email]"], "provider_accounts.bad.categories must not contain duplicates"],
    [["    plan: paid", "    categories: [email]", "    business_line: missing"], "provider_accounts.bad.business_line references unknown business line missing"],
    [["    plan: paid", "    categories: [email]", "    monthly_cost: 5"], "provider_accounts.bad.monthly_cost is not supported"],
  ])("rejects invalid entries (%#)", async (fields, message) => {
    await expect(load(base, ["provider_accounts:", "  bad:", ...fields])).rejects.toThrow(message);
  });
});
