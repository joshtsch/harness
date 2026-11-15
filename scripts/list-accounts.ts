#!/usr/bin/env tsx
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { loadHarnessConfig, providerAccountCategories, providerAccountsForProject, type ProviderAccount } from "../src/project-config.js";

const usage = "Usage: pnpm accounts [--project <name>] [--category <category>] [--json]";

let options: { project?: string; category?: string; json?: boolean };
try {
  options = parseArgs({
    args: process.argv.slice(2).filter((arg) => arg !== "--"),
    options: { project: { type: "string" }, category: { type: "string" }, json: { type: "boolean" } },
  }).values;
} catch {
  console.error(usage);
  process.exit(1);
}

if (options.category !== undefined && !(providerAccountCategories as readonly string[]).includes(options.category)) {
  console.error(`Unknown category. Known categories: ${providerAccountCategories.join(", ")}`);
  process.exit(1);
}

let config: Awaited<ReturnType<typeof loadHarnessConfig>>;
try {
  config = await loadHarnessConfig(resolve("projects.yml"), { resolveEnvironment: false });
} catch {
  // YAML parser errors can contain private source values.
  console.error("Unable to load provider accounts; validate projects.yml and projects.local.yml.");
  process.exit(1);
}

let accounts: ProviderAccount[] = config.providerAccounts;
if (options.project !== undefined) {
  const project = config.projects[options.project];
  if (!project) {
    console.error("Unknown project; run pnpm projects to list configured names.");
    process.exit(1);
  }
  accounts = providerAccountsForProject(accounts, project);
}
if (options.category !== undefined) accounts = accounts.filter(({ categories }) => categories.includes(options.category as never));

if (options.json) {
  console.log(JSON.stringify(accounts, null, 2));
} else if (accounts.length === 0) {
  console.log("No provider accounts match.");
} else {
  for (const account of accounts) {
    console.log(`${account.name}: ${account.plan}, held by ${account.businessLine ?? "personal"}`);
    console.log(`  categories: ${account.categories.join(", ")}`);
    if (account.notes) console.log(`  notes: ${account.notes}`);
  }
}
