export type SensitiveContentKind = "credential" | "private-key" | "email" | "phone";

export interface SensitiveContentFinding {
  kind: SensitiveContentKind;
  match: string;
  file?: string;
  line: number;
}

const credentialPattern = /(?:api[_-]?key|service[_-]?role[_-]?key|service[_-]?key|access[_-]?key|secret|token|password|client[_-]?secret)\s*[:=]\s*["']?([A-Za-z0-9_./+=-]{12,})/i;
const privateKeyPattern = /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/;
const tokenPattern = /\bsb_secret_[A-Za-z0-9_-]{16,}\b|\b(?:ghp|github_pat|xox[baprs])-[_A-Za-z0-9-]{10,}\b|\bAKIA[0-9A-Z]{16}\b|\bsk-[A-Za-z0-9]{20,}\b|\beyJ[A-Za-z0-9_-]{5,}\.eyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\b/;
const emailPattern = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const phonePattern = /(?<![\w-])(?:\+?\d[\d .()-]{8,}\d)(?![\w-])/g;

function phoneInput(line: string): string {
  const researchId = /(?:https?:\/\/(?:www\.)?arxiv\.org\/(?:abs|html|pdf)\/|https?:\/\/doi\.org\/10\.48550\/arxiv\.|\barxiv:\s*)\d{2}(?:0[1-9]|1[0-2])\.\d{4,5}(?:v[1-9]\d*)?(?![\w.-])/gi;
  return line.replace(researchId, (value) => " ".repeat(value.length)).replace(
    /(?<![\w-])(?:19|20)\d{2}-\d{2}-\d{2}(?![\d-])/g,
    (value) => {
      const date = new Date(value);
      return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value ? " ".repeat(value.length) : value;
    },
  );
}

export function findSensitiveContent(diff: string): SensitiveContentFinding[] {
  const findings: SensitiveContentFinding[] = [];
  let file: string | undefined;
  let lineNumber = 0;
  let inHunk = false;
  for (const line of diff.split("\n")) {
    if (line.startsWith("diff --git ")) { file = undefined; inHunk = false; continue; }
    if (!inHunk && line.startsWith("+++ ")) {
      const name = line.slice(4);
      let decoded = name;
      try { if (name.startsWith('"')) decoded = JSON.parse(name) as string; }
      catch { /* Git can use octal filename escapes outside JSON's syntax. */ }
      file = decoded.replace(/^b\//, "");
      continue;
    }
    const hunk = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)/);
    if (hunk) { lineNumber = Number(hunk[1]) - 1; inHunk = true; continue; }
    if (line.startsWith(" ")) { lineNumber++; continue; }
    if (!line.startsWith("+")) continue;
    const location = { ...(file ? { file } : {}), line: ++lineNumber };
    if (privateKeyPattern.test(line)) findings.push({ kind: "private-key", match: "private key marker", ...location });
    const credential = line.match(credentialPattern);
    if (credential) findings.push({ kind: "credential", match: credential[1], ...location });
    const token = line.match(tokenPattern);
    if (token) findings.push({ kind: "credential", match: token[0], ...location });
    for (const email of line.matchAll(emailPattern)) {
      if (email[0].toLowerCase() !== "git@github.com") findings.push({ kind: "email", match: email[0], ...location });
    }
    for (const phone of phoneInput(line).matchAll(phonePattern)) findings.push({ kind: "phone", match: phone[0], ...location });
  }
  return findings;
}
