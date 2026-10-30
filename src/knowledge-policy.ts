import { constants } from "node:fs";
import { open } from "node:fs/promises";

export type KnowledgeClassification = "Public" | "Private";

export interface KnowledgeDocument {
  pageId: string;
  classification: KnowledgeClassification | "Restricted";
  revision: string;
  sha256: string;
  status: "current" | "historical";
}

export interface KnowledgeSource {
  provider: "notion";
  classification: KnowledgeClassification | "Restricted";
  subject: string;
  enabled: boolean;
  expiresAt: string;
  purposes: string[];
  processors: string[];
  rootPageId: string;
  tokenEnvironment: string;
  connection: { isolated: boolean; tokenSha256: string; expiresAt: string };
  documents: Record<string, KnowledgeDocument>;
}

export interface KnowledgeSession {
  subject: string;
  processor: string;
  purpose: string;
  execution: "interactive" | "background";
  userRequested: boolean;
  expiresAt: string;
  sources: string[];
}

export interface KnowledgePolicy {
  version: 1;
  sources: Record<string, KnowledgeSource>;
  sessions: Record<string, KnowledgeSession>;
}

const slug = /^[a-z][a-z0-9-]{0,79}$/;
const digest = /^[a-f0-9]{64}$/;

export function notionId(value: unknown): string {
  if (typeof value !== "string" || !/^(?:[a-f0-9]{32}|[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12})$/i.test(value)) {
    throw new Error("Invalid knowledge page identifier");
  }
  return value.replaceAll("-", "").toLowerCase();
}

function object(value: unknown, fields?: string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid knowledge policy mapping");
  const record = value as Record<string, unknown>;
  if (fields && Object.keys(record).some((key) => !fields.includes(key))) throw new Error("Unsupported knowledge policy field");
  return record;
}

function text(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) throw new Error("Invalid knowledge policy string");
  return value;
}

function date(value: unknown): string {
  const result = text(value);
  if (!/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(result) || !Number.isFinite(Date.parse(result))) {
    throw new Error("Invalid knowledge policy timestamp");
  }
  return result;
}

function boolean(value: unknown): boolean {
  if (typeof value !== "boolean") throw new Error("Invalid knowledge policy boolean");
  return value;
}

function strings(value: unknown): string[] {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string" || !entry.trim()) || new Set(value).size !== value.length) {
    throw new Error("Invalid knowledge policy list");
  }
  return value as string[];
}

function entries<T>(value: unknown, parse: (item: unknown) => T): Record<string, T> {
  return Object.fromEntries(Object.entries(object(value)).map(([key, item]) => {
    if (!slug.test(key)) throw new Error("Invalid knowledge policy alias");
    return [key, parse(item)];
  }));
}

function hash(value: unknown): string {
  const result = text(value);
  if (!digest.test(result)) throw new Error("Invalid knowledge policy digest");
  return result;
}

export function parseKnowledgePolicy(value: unknown): KnowledgePolicy {
  const raw = object(value, ["version", "sources", "sessions"]);
  if (raw.version !== 1) throw new Error("Unsupported knowledge policy version");
  const sources = entries(raw.sources, (item): KnowledgeSource => {
    const source = object(item, ["provider", "classification", "subject", "enabled", "expiresAt", "purposes", "processors", "rootPageId", "tokenEnvironment", "connection", "documents"]);
    if (source.provider !== "notion") throw new Error("Unsupported knowledge provider");
    if (!["Public", "Private", "Restricted"].includes(source.classification as string)) throw new Error("Invalid knowledge source classification");
    const tokenEnvironment = text(source.tokenEnvironment);
    if (!/^NOTION_[A-Z0-9_]+_TOKEN$/.test(tokenEnvironment)) throw new Error("Invalid knowledge credential reference");
    const connection = object(source.connection, ["isolated", "tokenSha256", "expiresAt"]);
    const documents = entries(source.documents, (item): KnowledgeDocument => {
      const document = object(item, ["pageId", "classification", "revision", "sha256", "status"]);
      if (!["Public", "Private", "Restricted"].includes(document.classification as string)) throw new Error("Invalid knowledge classification");
      if (document.status !== "current" && document.status !== "historical") throw new Error("Invalid knowledge document status");
      return { pageId: notionId(document.pageId), classification: document.classification as KnowledgeDocument["classification"], revision: date(document.revision), sha256: hash(document.sha256), status: document.status };
    });
    if (new Set(Object.values(documents).map((document) => document.pageId)).size !== Object.keys(documents).length) throw new Error("Duplicate knowledge page");
    return {
      provider: "notion", classification: source.classification as KnowledgeSource["classification"], subject: text(source.subject), enabled: boolean(source.enabled), expiresAt: date(source.expiresAt),
      purposes: strings(source.purposes), processors: strings(source.processors), rootPageId: notionId(source.rootPageId), tokenEnvironment,
      connection: { isolated: boolean(connection.isolated), tokenSha256: hash(connection.tokenSha256), expiresAt: date(connection.expiresAt) }, documents,
    };
  });
  const sessions = entries(raw.sessions, (item): KnowledgeSession => {
    const session = object(item, ["subject", "processor", "purpose", "execution", "userRequested", "expiresAt", "sources"]);
    if (session.execution !== "interactive" && session.execution !== "background") throw new Error("Invalid knowledge execution mode");
    const selected = strings(session.sources);
    if (selected.some((id) => !Object.hasOwn(sources, id))) throw new Error("Unknown authorized knowledge source");
    return { subject: text(session.subject), processor: text(session.processor), purpose: text(session.purpose), execution: session.execution, userRequested: boolean(session.userRequested), expiresAt: date(session.expiresAt), sources: selected };
  });
  return { version: 1, sources, sessions };
}

/** Operator-owned policy is separate from prompt/tool arguments and is reloaded on every operation. */
export async function loadKnowledgePolicy(path: string): Promise<KnowledgePolicy> {
  let file;
  try {
    file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    const info = await file.stat();
    if (!info.isFile() || info.size > 1024 * 1024 || (info.mode & 0o077) !== 0 ||
      (process.getuid && info.uid !== process.getuid())) throw new Error("Unsafe policy file");
    return parseKnowledgePolicy(JSON.parse(await file.readFile("utf8")));
  } catch {
    throw new Error("Knowledge policy unavailable or invalid");
  } finally {
    await file?.close();
  }
}
