export type SensitiveContentKind = "credential" | "private-key" | "email" | "phone";

export interface SensitiveContentFinding {
  kind: SensitiveContentKind;
  match: string;
}

const credentialPattern = /(?:api[_-]?key|service[_-]?role[_-]?key|service[_-]?key|access[_-]?key|secret|token|password|client[_-]?secret)\s*[:=]\s*["']?([A-Za-z0-9_./+=-]{12,})/i;
const privateKeyPattern = /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/;
const tokenPattern = /\bsb_secret_[A-Za-z0-9_-]{16,}\b|\b(?:ghp|github_pat|xox[baprs])-[_A-Za-z0-9-]{10,}\b|\bAKIA[0-9A-Z]{16}\b|\bsk-[A-Za-z0-9]{20,}\b|\beyJ[A-Za-z0-9_-]{5,}\.eyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\b/;
const emailPattern = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const phonePattern = /(?<![\w-])(?:\+?\d[\d .()-]{8,}\d)(?![\w-])/g;

function addedLines(diff: string): string[] {
  return diff.split("\n").filter((line) => line.startsWith("+") && !line.startsWith("+++"));
}

export function findSensitiveContent(diff: string): SensitiveContentFinding[] {
  const findings: SensitiveContentFinding[] = [];
  for (const line of addedLines(diff)) {
    if (privateKeyPattern.test(line)) findings.push({ kind: "private-key", match: "private key marker" });
    const credential = line.match(credentialPattern);
    if (credential) findings.push({ kind: "credential", match: credential[1] });
    const token = line.match(tokenPattern);
    if (token) findings.push({ kind: "credential", match: token[0] });
    for (const email of line.matchAll(emailPattern)) {
      if (email[0].toLowerCase() !== "git@github.com") findings.push({ kind: "email", match: email[0] });
    }
    for (const phone of line.matchAll(phonePattern)) findings.push({ kind: "phone", match: phone[0] });
  }
  return findings;
}
