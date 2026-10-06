import { encryptContinuationArtifact, decryptContinuationArtifact } from "./continuation-crypto.js";
import { identityFromEnvironment, recipientFromEnvironment } from "../secure-records.js";
import type { ArtifactContent } from "./continuation.js";

export function continuationKeyFromEnvironment(): Buffer {
  const encoded = process.env.HARNESS_CONTINUATION_KEY_BASE64;
  if (!encoded) throw new Error("HARNESS_CONTINUATION_KEY_BASE64 must reference the shared key in external secret custody");
  const key = Buffer.from(encoded, "base64");
  if (key.length < 32 || key.toString("base64") !== encoded) throw new Error("HARNESS_CONTINUATION_KEY_BASE64 must be canonical base64 for at least 32 bytes");
  return key;
}

export function continuationEncryptor(): (plaintext: string) => Promise<Extract<ArtifactContent, { privacy: "encrypted" }>> {
  const recipients = recipientFromEnvironment();
  return (plaintext) => encryptContinuationArtifact(plaintext, recipients);
}

export function continuationDecryptor(): (content: ArtifactContent) => Promise<string> {
  const identity = identityFromEnvironment();
  return (content) => decryptContinuationArtifact(content, identity);
}
