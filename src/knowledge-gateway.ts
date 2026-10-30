import type { KnowledgeClassification, KnowledgeDocument, KnowledgePolicy, KnowledgeSource } from "./knowledge-policy.js";
import { NotionKnowledgeProvider } from "./notion-knowledge.js";

export interface KnowledgeSelection { source: string; document: string }

export interface KnowledgeRead {
  classification: KnowledgeClassification;
  documents: {
    source: string;
    document: string;
    classification: KnowledgeClassification;
    status: "current" | "historical";
    content: string;
    citation: { url: string; revision: string; sha256: string; retrievedAt: string };
  }[];
}

export interface KnowledgeGatewayOptions {
  loadPolicy: () => Promise<KnowledgePolicy>;
  /** Selected by the trusted launcher, never by a tool call. */
  sessionId: string;
  environment?: Record<string, string | undefined>;
  provider?: NotionKnowledgeProvider;
  now?: () => number;
}

function fresh(value: string, now: number): boolean {
  return Number.isFinite(Date.parse(value)) && Date.parse(value) > now;
}

export function createKnowledgeGateway(options: KnowledgeGatewayOptions) {
  const provider = options.provider ?? new NotionKnowledgeProvider();
  const environment = options.environment ?? process.env;
  const now = options.now ?? Date.now;

  function authorize(policy: KnowledgePolicy, sourceId: string): KnowledgeSource {
    const session = policy.sessions[options.sessionId];
    const source = policy.sources[sourceId];
    const at = now();
    if (!session || !source || !session.sources.includes(sourceId) || !session.userRequested || session.execution !== "interactive" ||
      session.processor !== "codex/openai" || !fresh(session.expiresAt, at) ||
      !source.enabled || !source.connection.isolated || !fresh(source.expiresAt, at) || !fresh(source.connection.expiresAt, at) ||
      source.subject !== session.subject || !source.processors.includes(session.processor) || !source.purposes.includes(session.purpose)) {
      throw new Error("Knowledge access denied");
    }
    return source;
  }

  return {
    async discover() {
      const policy = await options.loadPolicy();
      const session = policy.sessions[options.sessionId];
      if (!session || !fresh(session.expiresAt, now()) || session.execution !== "interactive" || !session.userRequested || session.processor !== "codex/openai") throw new Error("Knowledge access denied");
      return session.sources.map((id) => {
        const source = authorize(policy, id);
        return {
          source: id, provider: source.provider,
          documents: Object.entries(source.documents).filter(([, document]) => document.classification !== "Restricted")
            .map(([id, document]) => ({ document: id, classification: document.classification, status: document.status })),
        };
      });
    },

    async read(selections: KnowledgeSelection[]): Promise<KnowledgeRead> {
      if (!Array.isArray(selections) || selections.length < 1 || selections.length > 8 || selections.some((item) =>
        !item || typeof item.source !== "string" || typeof item.document !== "string" || Object.keys(item).some((key) => !["source", "document"].includes(key)))) {
        throw new Error("Invalid knowledge selection");
      }
      const policy = await options.loadPolicy();
      const approved = selections.map((selection) => {
        const source = authorize(policy, selection.source);
        const document: KnowledgeDocument | undefined = source.documents[selection.document];
        if (!document || document.classification === "Restricted") throw new Error("Knowledge document is not approved");
        const token = environment[source.tokenEnvironment];
        if (!token) throw new Error("Knowledge credential unavailable");
        return { selection, source, document, token };
      });
      const documents: KnowledgeRead["documents"] = [];
      for (const { selection, source, document, token } of approved) {
        const content = await provider.read(source, document, token);
        documents.push({
          ...selection, content, classification: document.classification as KnowledgeClassification, status: document.status,
          citation: { url: `https://www.notion.so/${document.pageId}`, revision: document.revision, sha256: document.sha256, retrievedAt: new Date(now()).toISOString() },
        });
      }
      // Return nothing if any source/session is revoked or changed during a multi-source fetch.
      const latest = await options.loadPolicy();
      for (const { selection, source } of approved) {
        if (JSON.stringify(authorize(latest, selection.source)) !== JSON.stringify(source) ||
          JSON.stringify(latest.sessions[options.sessionId]) !== JSON.stringify(policy.sessions[options.sessionId])) throw new Error("Knowledge authorization changed; retry retrieval");
      }
      return { classification: documents.some((document) => document.classification === "Private") ? "Private" : "Public", documents };
    },
  };
}
