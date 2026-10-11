import { lstat, readFile, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { LocalJsonDecisionMemoryStore, resolveDecisionMemory, type DecisionMemoryRecord, type DecisionMemoryScope } from "../src/decision-memory.js";

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

const usage = "pnpm decision-memory list [--category <id>] | get --category <id> [--user <id>] [--business-line <id>] [--project <id>] [--environment <id>] [--project-actual <value>] [--project-root <path> --decision-record <path>] | record --input <json-file> --confirm [--replace-id <id>] | forget --id <id> --confirm";

async function run(): Promise<void> {
  if (command === "list") {
    noUnknownOptions(["--category"]);
    const category = option("--category");
    const records = await store.list();
    console.log(JSON.stringify(category ? records.filter((record) => record.category === category) : records, null, 2));
    return;
  }

  if (command === "get") {
    noUnknownOptions(["--category", "--user", "--business-line", "--project", "--environment", "--project-actual", "--project-root", "--decision-record"]);
    const category = requiredOption("--category");
    const actualProjectValue = option("--project-actual");
    const decisionRecord = option("--decision-record");
    const projectRoot = option("--project-root");
    if (decisionRecord && (!actualProjectValue || !projectRoot)) throw new Error("--decision-record requires --project-actual and --project-root");
    const query = {
      category,
      scope: {
        user: option("--user") ?? "local",
        ...(option("--business-line") ? { businessLine: option("--business-line") } : {}),
        ...(option("--project") ? { project: option("--project") } : {}),
        ...(option("--environment") ? { environment: option("--environment") } : {}),
      },
    };
    const records = await store.list();
    const candidate = resolveDecisionMemory(query, records);
    const verifiedDecisionRecord = decisionRecord && projectRoot && actualProjectValue && candidate.status === "available"
      ? await verifyProjectDecisionRecord(decisionRecord, projectRoot, category, actualProjectValue, query.scope, candidate.preference!.preference)
      : undefined;
    const result = resolveDecisionMemory(query, records, {
      ...(actualProjectValue ? { project: { actualProjectValue, ...(verifiedDecisionRecord ? { decisionRecord: { path: decisionRecord!, verified: true as const } } : {}) } } : {}),
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

async function verifyProjectDecisionRecord(
  path: string,
  projectRoot: string,
  category: string,
  actual: string,
  queryScope: DecisionMemoryScope,
  preference: string,
): Promise<boolean> {
  if (!isAbsolute(path) || !isAbsolute(projectRoot)) return false;
  try {
    const [rootInfo, info, realRoot, realRecord] = await Promise.all([
      lstat(projectRoot), lstat(path), realpath(projectRoot), realpath(path),
    ]);
    if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink() || !info.isFile() || info.isSymbolicLink() || info.size > 64 * 1024) return false;
    const fromRoot = relative(realRoot, realRecord);
    if (!fromRoot || fromRoot === ".." || fromRoot.startsWith(`..${sep}`) || isAbsolute(fromRoot)) return false;
    const source = await readFile(realRecord, "utf8");
    const fields = new Map<string, string>();
    for (const line of source.split(/\r?\n/)) {
      const match = /^- (Category|Scope|Preferred pattern|Actual pattern|Reason|Date|Deciding authority|Configuration reference):\s*(.+)$/.exec(line);
      if (match) fields.set(match[1]!.toLowerCase(), match[2]!.trim());
    }
    const scope = parseDecisionScope(fields.get("scope"));
    return fields.get("category") === category
      && Boolean(queryScope.project) && scope !== undefined && scope.project === queryScope.project
      && Object.entries(scope ?? {}).every(([key, value]) => queryScope[key as keyof DecisionMemoryScope] === value)
      && fields.get("preferred pattern") === preference
      && fields.get("actual pattern") === actual
      && Boolean(fields.get("reason"))
      && Boolean(fields.get("date") && Number.isFinite(Date.parse(fields.get("date")!)))
      && Boolean(fields.get("deciding authority"))
      && Boolean(fields.get("configuration reference"));
  } catch {
    return false;
  }
}

function parseDecisionScope(value: string | undefined): Partial<DecisionMemoryScope> | undefined {
  if (!value) return undefined;
  const scope: Partial<DecisionMemoryScope> = {};
  for (const part of value.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 1) return undefined;
    const key = part.slice(0, separator).trim();
    const entry = part.slice(separator + 1).trim();
    if (!["user", "businessLine", "project", "environment"].includes(key) || !entry || key in scope) return undefined;
    scope[key as keyof DecisionMemoryScope] = entry;
  }
  return scope;
}

run().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "decision memory operation failed");
  process.exitCode = 1;
});
