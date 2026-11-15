#!/usr/bin/env tsx
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { isProviderAccountCategory, loadHarnessConfig, providerAccountCategories, selectProviderAccounts, type HarnessConfig, type ProviderAccount } from "../src/project-config.js";

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

const category = options.category;
if (category !== undefined && !isProviderAccountCategory(category)) {
  console.error(`Unknown category. Known categories: ${providerAccountCategories.join(", ")}`);
  process.exit(1);
}

let config: HarnessConfig;
try {
  config = await loadHarnessConfig(resolve("projects.yml"), { resolveEnvironment: false });
} catch {
  // YAML parser errors can contain private source values.
  console.error("Unable to load provider accounts; validate projects.yml and projects.local.yml.");
  process.exit(1);
}

let accounts: ProviderAccount[];
try {
  accounts = selectProviderAccounts(config, { ...(options.project === undefined ? {} : { project: options.project }), ...(category === undefined ? {} : { category }) });
} catch (error) {
  console.error((error as Error).message);
  process.exit(1);
}

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
