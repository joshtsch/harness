import { spawn } from "node:child_process";

type Runner = (args: string[], input?: string, session?: string) => Promise<string>;

export const secureRecordItemPrefix = "Harness Secure Record: ";

export function secureRecordItemName(recordId: string): string {
  return `${secureRecordItemPrefix}${recordId}`;
}

function redact(message: string): string {
  return message.replace(/session\s+[^\s]+/gi, "session [redacted]");
}

async function defaultRunner(args: string[], input?: string, session?: string): Promise<string> {
  if (input && (args[0] === "create" || args[0] === "edit")) return runEncodedPipeline(args, input, session);
  return await new Promise((resolve, reject) => {
    const child = spawn("bw", args, { stdio: ["pipe", "pipe", "pipe"], env: session ? { ...process.env, BW_SESSION: session } : process.env });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => { stdout += chunk; });
    child.stderr.on("data", (chunk: Buffer) => { stderr += chunk; });
    child.on("error", (error) => reject(error.message.includes("ENOENT") ? new Error("Bitwarden CLI is required for secure records") : error));
    child.on("close", (code) => code === 0
      ? resolve(stdout)
      : reject(new Error(`Bitwarden operation failed: ${redact(stderr).trim()}`)));
    if (input) child.stdin.write(input);
    child.stdin.end();
  });
}

async function runEncodedPipeline(args: string[], input: string, session?: string): Promise<string> {
  return await new Promise((resolve, reject) => {
    const env = session ? { ...process.env, BW_SESSION: session } : process.env;
    const encoder = spawn("bw", ["encode"], { stdio: ["pipe", "pipe", "pipe"], env });
    const command = spawn("bw", args, { stdio: ["pipe", "pipe", "pipe"], env });
    let stdout = "";
    let stderr = "";
    command.stdout.on("data", (chunk: Buffer) => { stdout += chunk; });
    encoder.stderr.on("data", (chunk: Buffer) => { stderr += chunk; });
    command.stderr.on("data", (chunk: Buffer) => { stderr += chunk; });
    const fail = (error: Error) => reject(error.message.includes("ENOENT") ? new Error("Bitwarden CLI is required for secure records") : error);
    encoder.on("error", fail);
    command.on("error", fail);
    command.on("close", (code) => code === 0
      ? resolve(stdout)
      : reject(new Error(`Bitwarden operation failed: ${redact(stderr).trim()}`)));
    encoder.stdout.pipe(command.stdin);
    encoder.stdin.end(input);
  });
}

type BitwardenItem = { id?: unknown; name?: unknown; notes?: unknown };

export class BitwardenSecureRecordStore {
  constructor(private readonly run: Runner = defaultRunner) {}

  async get(recordId: string, session: string): Promise<Buffer | null> {
    let item: BitwardenItem;
    try {
      item = JSON.parse(await this.run(["get", "item", secureRecordItemName(recordId)], undefined, session)) as BitwardenItem;
    } catch (error) {
      if (error instanceof Error && error.message.toLowerCase().includes("not found")) return null;
      throw error;
    }
    if (typeof item.notes !== "string") throw new Error(`invalid Bitwarden secure record ${recordId}`);
    let payload: unknown;
    try { payload = JSON.parse(item.notes); } catch { throw new Error(`invalid Bitwarden secure record ${recordId}`); }
    if (!payload || typeof payload !== "object" || (payload as { format_version?: unknown }).format_version !== 1
      || (payload as { record_id?: unknown }).record_id !== recordId
      || typeof (payload as { ciphertext_base64?: unknown }).ciphertext_base64 !== "string") {
      throw new Error(`invalid Bitwarden secure record ${recordId}`);
    }
    return Buffer.from((payload as { ciphertext_base64: string }).ciphertext_base64, "base64");
  }

  async put(recordId: string, ciphertext: Buffer, session: string, replace = false): Promise<void> {
    const name = secureRecordItemName(recordId);
    let existing: BitwardenItem | null = null;
    try {
      existing = JSON.parse(await this.run(["get", "item", name], undefined, session)) as BitwardenItem;
    } catch (error) {
      if (!(error instanceof Error) || !error.message.toLowerCase().includes("not found")) throw error;
    }
    if (existing && !replace) throw new Error(`Bitwarden secure record already exists: ${recordId}`);
    const payload = JSON.stringify({ format_version: 1, record_id: recordId, ciphertext_base64: ciphertext.toString("base64") });
    const item = { type: 2, name, notes: payload, secureNote: { type: 0 } };
    if (existing && typeof existing.id === "string") await this.run(["edit", "item", existing.id], JSON.stringify({ ...existing, ...item }), session);
    else await this.run(["create", "item"], JSON.stringify(item), session);
  }

  async list(session: string): Promise<string[]> {
    const items = JSON.parse(await this.run(["list", "items", "--search", secureRecordItemPrefix], undefined, session)) as BitwardenItem[];
    return items
      .map((item) => typeof item.name === "string" && item.name.startsWith(secureRecordItemPrefix) ? item.name.slice(secureRecordItemPrefix.length) : null)
      .filter((recordId): recordId is string => recordId !== null)
      .filter((recordId) => /^[a-z0-9][a-z0-9-]*$/.test(recordId))
      .sort();
  }
}
