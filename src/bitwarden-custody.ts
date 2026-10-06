import { spawn } from "node:child_process";
import { custodyNoteNames, type CustodyIdentity, type EncryptionIdentityRole, type KeyCustodyProvider, parseCustodyIdentity, serializeCustodyIdentity } from "./key-custody.js";

type Runner = (args: string[], input?: string, session?: string) => Promise<string>;
const secretPattern = /AGE-SECRET-KEY-[A-Z0-9-]+/g;

function redact(message: string): string {
  return message.replace(/session\s+[^\s]+/gi, "session [redacted]").replace(secretPattern, "AGE-SECRET-KEY-[redacted]");
}

async function defaultRunner(args: string[], input?: string, session?: string): Promise<string> {
  if (input && (args[0] === "create" || args[0] === "edit")) {
    return await runEncodedPipeline(args, input, session);
  }
  return await new Promise((resolve, reject) => {
    const child = spawn("bw", args, { stdio: ["pipe", "pipe", "pipe"], env: session ? { ...process.env, BW_SESSION: session } : process.env });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => { stdout += chunk; });
    child.stderr.on("data", (chunk: Buffer) => { stderr += chunk; });
    child.on("error", (error) => reject(error.message.includes("ENOENT") ? new Error("Bitwarden CLI is required for key custody") : error));
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
    const fail = (error: Error) => reject(error.message.includes("ENOENT") ? new Error("Bitwarden CLI is required for key custody") : error);
    encoder.on("error", fail);
    command.on("error", fail);
    command.on("close", (code) => code === 0
      ? resolve(stdout)
      : reject(new Error(`Bitwarden operation failed: ${redact(stderr).trim()}`)));
    encoder.stdout.pipe(command.stdin);
    encoder.stdin.end(input);
  });
}

export class BitwardenKeyCustody implements KeyCustodyProvider {
  constructor(private readonly run: Runner = defaultRunner) {}

  async get(role: EncryptionIdentityRole, session: string): Promise<CustodyIdentity> {
    const value = await this.getItem(role, session);
    if (typeof value.notes !== "string") throw new Error(`invalid ${role} custody item`);
    return parseCustodyIdentity(value.notes, role);
  }

  private async getItem(role: EncryptionIdentityRole, session: string): Promise<Record<string, unknown>> {
    const output = await this.run(["get", "item", custodyNoteNames[role]], undefined, session);
    let item: unknown;
    try {
      item = JSON.parse(output);
    } catch {
      throw new Error(`invalid ${role} custody item`);
    }
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error(`invalid ${role} custody item`);
    const value = item as Record<string, unknown>;
    if (typeof value.id !== "string") throw new Error(`invalid ${role} custody item`);
    return value;
  }

  async put(identity: CustodyIdentity, session: string, replace = false): Promise<void> {
    const name = custodyNoteNames[identity.role];
    let itemId: string | undefined;
    if (!replace) {
      try {
        await this.get(identity.role, session);
        throw new Error(`${identity.role} custody note already exists`);
      } catch (error) {
        if (!(error instanceof Error) || !error.message.toLowerCase().includes("not found")) throw error;
      }
    } else {
      const item = await this.getItem(identity.role, session);
      itemId = item.id as string;
      item.name = name;
      item.notes = serializeCustodyIdentity(identity);
      const payload = JSON.stringify(item);
      await this.run(["edit", "item", itemId], payload, session);
      return;
    }
    const payload = JSON.stringify({ type: 2, name, notes: serializeCustodyIdentity(identity), secureNote: { type: 0 } });
    await this.run(["create", "item"], payload, session);
  }
}
