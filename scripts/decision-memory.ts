import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { LocalJsonDecisionMemoryStore, resolveDecisionMemory, type DecisionMemoryRecord } from "../src/decision-memory.js";

const [command, ...args] = process.argv.slice(2).filter((arg) => arg !== "--");
const store = new LocalJsonDecisionMemoryStore();

function option(name: string): string | undefined {
  const index = args.indexOf(name);
  return index < 0 ? undefined : args[index + 1];
}

function requiredOption(name: string): string {
  const value = option(name);
  if (!value?.trim()) throw new Error(`${name} is required`);
  return value;
}

function noUnknownOptions(allowed: string[], flags: string[] = []): void {
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!;
    if (!arg.startsWith("--")) throw new Error(`unexpected argument; see: ${usage}`);
    if (flags.includes(arg)) continue;
    if (!allowed.includes(arg) || !args[index + 1] || args[index + 1]!.startsWith("--")) {
      throw new Error(`invalid decision-memory options; see: ${usage}`);
    }
    index += 1;
  }
}

const usage = "pnpm decision-memory list [--category <id>] | get --category <id> [--user <id>] [--business-line <id>] [--project <id>] [--environment <id>] [--project-actual <value>] [--decision-record <path>] | record --input <json-file> --confirm [--replace-id <id>] | forget --id <id> --confirm";

async function run(): Promise<void> {
  if (command === "list") {
    noUnknownOptions(["--category"]);
    const category = option("--category");
    const records = await store.list();
    console.log(JSON.stringify(category ? records.filter((record) => record.category === category) : records, null, 2));
    return;
  }

  if (command === "get") {
    noUnknownOptions(["--category", "--user", "--business-line", "--project", "--environment", "--project-actual", "--decision-record"]);
    const category = requiredOption("--category");
    const actualProjectValue = option("--project-actual");
    const decisionRecord = option("--decision-record");
    if (decisionRecord && !actualProjectValue) throw new Error("--decision-record requires --project-actual");
    const result = resolveDecisionMemory({
      category,
      scope: {
        user: option("--user") ?? "local",
        ...(option("--business-line") ? { businessLine: option("--business-line") } : {}),
        ...(option("--project") ? { project: option("--project") } : {}),
        ...(option("--environment") ? { environment: option("--environment") } : {}),
      },
    }, await store.list(), {
      ...(actualProjectValue ? { project: { actualProjectValue, ...(decisionRecord ? { decisionRecord } : {}) } } : {}),
    });
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (command === "record") {
    noUnknownOptions(["--input", "--replace-id"], ["--confirm"]);
    if (!args.includes("--confirm")) throw new Error("decision memory writes require --confirm after reviewing the record");
    const input = resolve(requiredOption("--input"));
    let record: DecisionMemoryRecord;
    try { record = JSON.parse(await readFile(input, "utf8")) as DecisionMemoryRecord; }
    catch { throw new Error("decision memory input must be valid JSON"); }
    await store.record(record, { confirmed: true, ...(option("--replace-id") ? { replaceId: option("--replace-id") } : {}) });
    console.log(`Recorded decision memory ${record.id}.`);
    return;
  }

  if (command === "forget") {
    noUnknownOptions(["--id"], ["--confirm"]);
    await store.forget(requiredOption("--id"), { confirmed: args.includes("--confirm") });
    console.log("Removed the confirmed decision memory record.");
    return;
  }

  throw new Error(`unknown decision-memory command; use: ${usage}`);
}

run().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "decision memory operation failed");
  process.exitCode = 1;
});
