import { chmod, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";

export function bitwardenSessionFile(): string {
  return process.env.HARNESS_BITWARDEN_SESSION_FILE
    ?? join(tmpdir(), `harness-bitwarden-session-${process.getuid?.() ?? "user"}`);
}

export async function unlockBitwardenSession(): Promise<string> {
  return await new Promise((resolve, reject) => {
    const child = spawn("bw", ["unlock", "--raw"], { stdio: ["inherit", "pipe", "inherit"], env: process.env });
    let output = "";
    child.stdout.on("data", (chunk: Buffer) => { output += chunk; });
    child.on("error", (error) => reject(error.message.includes("ENOENT") ? new Error("Bitwarden CLI is required for key custody") : error));
    child.on("close", (code) => {
      const session = output.trim();
      if (code !== 0 || !session) reject(new Error("Bitwarden unlock failed"));
      else resolve(session);
    });
  });
}

export async function saveBitwardenSession(session: string, path = bitwardenSessionFile()): Promise<void> {
  if (!session.trim()) throw new Error("Bitwarden session is empty");
  await writeFile(path, `${session.trim()}\n`, { encoding: "utf8", mode: 0o600 });
  await chmod(path, 0o600);
}

export async function resolveBitwardenSession(): Promise<string> {
  const supplied = process.env.HARNESS_BITWARDEN_SESSION ?? process.env.BW_SESSION;
  if (supplied) return supplied;
  try {
    const stored = (await readFile(bitwardenSessionFile(), "utf8")).trim();
    if (stored) return stored;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  return unlockBitwardenSession();
}
