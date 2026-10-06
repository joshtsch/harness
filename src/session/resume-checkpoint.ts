import { randomUUID } from "node:crypto";
import { chmod, lstat, readFile, rename, unlink, writeFile } from "node:fs/promises";
import type { ArtifactContent, ArtifactKind } from "./continuation.js";

export interface ResumeCheckpoint {
  sessionKey: string;
  owner: string;
  leaseExpiresAt: number;
  artifacts: Array<{ kind: ArtifactKind; key: string; revision: number; content: string }>;
}

export function resumeProviderPayload(
  sessionKey: string,
  leaseExpiresAt: number | undefined,
  checkpointFile: string,
  artifacts: ResumeCheckpoint["artifacts"],
): string {
  return JSON.stringify({ status: "claimed", sessionKey, leaseExpiresAt, checkpointFile, artifacts });
}

type EncryptedArtifact = Extract<ArtifactContent, { privacy: "encrypted" }>;
type Encryptor = (plaintext: string) => Promise<EncryptedArtifact>;
type Decryptor = (content: ArtifactContent) => Promise<string>;

function validateCheckpoint(value: unknown): ResumeCheckpoint {
  if (!value || typeof value !== "object" || typeof (value as ResumeCheckpoint).sessionKey !== "string"
    || !/^sessions\/[0-9a-f]{64}$/.test((value as ResumeCheckpoint).sessionKey)
    || typeof (value as ResumeCheckpoint).owner !== "string" || !(value as ResumeCheckpoint).owner.trim()
    || !Number.isSafeInteger((value as ResumeCheckpoint).leaseExpiresAt)
    || !Array.isArray((value as ResumeCheckpoint).artifacts)) throw new Error("checkpoint file is invalid");
  return value as ResumeCheckpoint;
}

export async function readResumeCheckpoint(path: string, decrypt: Decryptor): Promise<ResumeCheckpoint> {
  const details = await lstat(path);
  if (!details.isFile() || details.isSymbolicLink() || (details.mode & 0o077) !== 0 || details.size > 16 * 1024 * 1024) {
    throw new Error("checkpoint file must be a private regular file under 16 MiB");
  }
  try {
    const ciphertext = await readFile(path, "utf8");
    if (!ciphertext.startsWith("-----BEGIN AGE ENCRYPTED FILE-----")) throw new Error("not encrypted");
    return validateCheckpoint(JSON.parse(await decrypt({ privacy: "encrypted", ciphertext })));
  } catch {
    throw new Error("checkpoint file is invalid");
  }
}

export async function writeResumeCheckpoint(
  path: string,
  checkpoint: ResumeCheckpoint,
  encrypt: Encryptor,
  replace = false,
): Promise<void> {
  const ciphertext = (await encrypt(JSON.stringify(checkpoint, null, 2))).ciphertext;
  if (!ciphertext.startsWith("-----BEGIN AGE ENCRYPTED FILE-----")) throw new Error("checkpoint encryption returned invalid ciphertext");

  if (!replace) {
    await writeFile(path, ciphertext, { mode: 0o600, flag: "wx" });
    return;
  }

  try {
    const existing = await lstat(path);
    if (!existing.isFile() || existing.isSymbolicLink()) throw new Error("checkpoint file must be a regular file");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, ciphertext, { encoding: "utf8", flag: "wx", mode: 0o600 });
    await rename(temporary, path);
    await chmod(path, 0o600);
  } catch (error) {
    await unlink(temporary).catch(() => {});
    throw error;
  }
}

export async function renewResumeCheckpoint(
  path: string,
  decrypt: Decryptor,
  encrypt: Encryptor,
  renew: (sessionKey: string, owner: string) => Promise<number>,
  sessionOverride?: string,
): Promise<{ sessionKey: string; leaseExpiresAt: number }> {
  const checkpoint = await readResumeCheckpoint(path, decrypt);
  if (sessionOverride && sessionOverride !== checkpoint.sessionKey) throw new Error("session key does not match checkpoint file");
  const leaseExpiresAt = await renew(checkpoint.sessionKey, checkpoint.owner);
  await writeResumeCheckpoint(path, { ...checkpoint, leaseExpiresAt }, encrypt, true);
  return { sessionKey: checkpoint.sessionKey, leaseExpiresAt };
}
