#!/usr/bin/env tsx
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { stringify } from "yaml";
import { saveProviderAccountChange, setProviderAccount } from "../src/provider-account-edit.js";
import { isProviderAccountCategory, loadHarnessConfig, providerAccountCategories, selectProviderAccounts, type HarnessConfig, type ProviderAccount } from "../src/project-config.js";

const usage = "Usage: pnpm accounts [--project <name>] [--category <category>] [--json]";
const setUsage = "Usage: pnpm accounts set <name> [--plan paid|free] [--categories a,b] [--business-line <line> | --personal] [--notes <text> | --clear-notes] [--write] [--skip-backup]";
const backupRetry = "Run pnpm config:backup --replace to update the encrypted backup.";

const cliArgs = process.argv.slice(2).filter((arg) => arg !== "--");
if (cliArgs[0] === "set") {
  await setAccount(cliArgs.slice(1));
  process.exit();
}

async function setAccount(args: string[]): Promise<void> {
  let parsed;
  try {
    parsed = parseArgs({
      args,
      allowPositionals: true,
      options: {
        plan: { type: "string" },
        categories: { type: "string" },
        "business-line": { type: "string" },
        personal: { type: "boolean" },
        notes: { type: "string" },
        "clear-notes": { type: "boolean" },
        write: { type: "boolean" },
        "skip-backup": { type: "boolean" },
      },
    });
  } catch {
    console.error(setUsage);
    process.exit(1);
  }
  const { positionals, values } = parsed;
  const name = positionals[0];
  if (positionals.length !== 1 || name === undefined) {
    console.error(setUsage);
    process.exit(1);
  }
  const categories = values.categories?.split(",").map((category) => category.trim());
  const unknown = categories?.find((category) => !isProviderAccountCategory(category));
  if (unknown !== undefined) {
    console.error(`Unknown category ${unknown}. Known categories: ${providerAccountCategories.join(", ")}`);
    process.exit(1);
  }

  const publicPath = resolve("projects.yml");
  const localPath = resolve("projects.local.yml");
  let localSource = "";
  try {
    localSource = await readFile(localPath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }

  let result;
  try {
    result = setProviderAccount(localSource, name, {
      ...(values.plan === undefined ? {} : { plan: values.plan }),
      ...(categories === undefined ? {} : { categories }),
      ...(values["business-line"] === undefined ? {} : { businessLine: values["business-line"] }),
      ...(values.notes === undefined ? {} : { notes: values.notes }),
      personal: values.personal ?? false,
      clearNotes: values["clear-notes"] ?? false,
    });
  } catch (error) {
    console.error((error as Error).message);
    process.exit(1);
  }

  // Validate the whole merged configuration before anything is written.
  const staging = await mkdtemp(join(tmpdir(), "harness-accounts-"));
  try {
    const candidatePath = join(staging, "projects.local.yml");
    await writeFile(candidatePath, result.source, { mode: 0o600 });
    await loadHarnessConfig(publicPath, { localConfigPath: candidatePath, resolveEnvironment: false });
  } catch (error) {
    const message = (error as Error).message;
    // Only this account's errors are echoed; others can contain private source values.
    console.error(message.startsWith(`provider_accounts.${name}`) ? message : "Unable to validate the change; validate projects.yml and projects.local.yml.");
    process.exit(1);
  } finally {
    await rm(staging, { recursive: true, force: true });
  }

  console.log(`${result.status === "added" ? "Add" : result.status === "changed" ? "Change" : "No change to"} provider account ${name}:`);
  console.log(stringify({ provider_accounts: { [name]: result.entry } }).trimEnd());
  if (result.status === "unchanged") return;
  if (!values.write) {
    console.log("Dry run; rerun with --write to save.");
    return;
  }

  const saved = await saveProviderAccountChange(publicPath, localPath, result.source, values["skip-backup"] ?? false);
  console.log("Saved projects.local.yml.");
  if (saved.backup === "updated") console.log("Updated the encrypted backup.");
  else if (saved.backup === "skipped") console.log(`Skipped backup. ${backupRetry}`);
  else {
    console.error(`Backup failed: ${saved.error.message}. The local change is kept. ${backupRetry}`);
    process.exit(1);
  }
}

let options: { project?: string; category?: string; json?: boolean };
try {
  options = parseArgs({
    args: cliArgs,
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
