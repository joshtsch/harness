import { spawn } from "node:child_process";
import { resolve } from "node:path";
import type { ArtifactContent } from "./continuation.js";

const maxArtifactBytes = 8 * 1024 * 1024;
type AgeRunner = (args: string[], input: string) => Promise<string>;

function runAge(args: string[], input: string): Promise<string> {
  return new Promise((resolveOutput, reject) => {
    const child = spawn("age", args, { stdio: ["pipe", "pipe", "ignore"] });
    const chunks: Buffer[] = [];
    let outputBytes = 0;
    let failed = false;

    child.stdout.on("data", (chunk: Buffer) => {
      outputBytes += chunk.length;
      if (outputBytes > maxArtifactBytes) {
        failed = true;
        child.kill();
        reject(new Error("continuation artifact exceeds the size limit"));
        return;
      }
      chunks.push(chunk);
    });
    child.on("error", () => {
      if (!failed) reject(new Error("age is required for continuation encryption"));
    });
    child.on("close", (code) => {
      if (failed) return;
      if (code !== 0) {
        reject(new Error("age continuation cryptography failed"));
        return;
      }
      resolveOutput(Buffer.concat(chunks).toString("utf8"));
    });
    child.stdin.on("error", () => {
      // The process exit reports malformed ciphertext or a closed input stream.
    });
    child.stdin.end(input, "utf8");
  });
}

export async function encryptContinuationArtifact(plaintext: string, recipients: string[], runner: AgeRunner = runAge): Promise<Extract<ArtifactContent, { privacy: "encrypted" }>> {
  if (!plaintext.trim()) throw new Error("continuation artifact cannot be empty");
  if (Buffer.byteLength(plaintext, "utf8") > maxArtifactBytes) throw new Error("continuation artifact exceeds the size limit");
  if (recipients.length < 2 || recipients.some((recipient) => !recipient.trim()) || new Set(recipients).size !== recipients.length) {
    throw new Error("continuation encryption requires distinct primary and recovery recipients");
  }
  const args = ["-a", ...recipients.flatMap((recipient) => ["-r", recipient])];
  const ciphertext = await runner(args, plaintext);
  if (!ciphertext.startsWith("-----BEGIN AGE ENCRYPTED FILE-----")) throw new Error("age did not return an armored encrypted artifact");
  return { privacy: "encrypted", ciphertext };
}

export async function decryptContinuationArtifact(content: ArtifactContent, identityFile: string, runner: AgeRunner = runAge): Promise<string> {
  const ciphertext = content.ciphertext;
  if (!ciphertext.startsWith("-----BEGIN AGE ENCRYPTED FILE-----")) throw new Error("continuation ciphertext is malformed");
  const plaintext = await runner(["-d", "-i", resolve(identityFile)], ciphertext);
  if (Buffer.byteLength(plaintext, "utf8") > maxArtifactBytes) throw new Error("continuation artifact exceeds the size limit");
  return plaintext;
}
