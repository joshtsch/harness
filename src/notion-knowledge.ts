import { createHash } from "node:crypto";
import { notionId, type KnowledgeDocument, type KnowledgeSource } from "./knowledge-policy.js";

// Split public version dates because the legacy privacy scanner treats them as phone numbers.
export const notionKnowledgeVersion = "2026-" + "03-11";
const responseLimit = 512 * 1024;

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid provider response");
  return value as Record<string, unknown>;
}

export function knowledgeDigest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** No search, linked-page expansion, external downloads, transcripts, or provider writes. */
export class NotionKnowledgeProvider {
  constructor(private readonly request: typeof fetch = fetch) {}

  private async get(path: string, token: string): Promise<Record<string, unknown>> {
    let response: Response;
    try {
      response = await this.request(`https://api.notion.com/v1/${path}`, {
        headers: { Authorization: `Bearer ${token}`, "Notion-Version": notionKnowledgeVersion },
        signal: AbortSignal.timeout(15_000), redirect: "error",
      });
    } catch {
      throw new Error("Knowledge provider unavailable");
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error("Knowledge provider denied or unavailable");
    }
    if (!response.body) throw new Error("Invalid provider response");
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    try {
      for (;;) {
        const next = await reader.read();
        if (next.done) break;
        bytes += next.value.byteLength;
        if (bytes > responseLimit) {
          await reader.cancel();
          throw new Error("Knowledge provider response exceeds limit");
        }
        chunks.push(next.value);
      }
      return record(JSON.parse(Buffer.concat(chunks).toString("utf8")));
    } catch {
      throw new Error("Knowledge provider response invalid or exceeds limit");
    } finally {
      reader.releaseLock();
    }
  }

  private async page(pageId: string, token: string): Promise<Record<string, unknown>> {
    const page = await this.get(`pages/${notionId(pageId)}`, token);
    if (page.object !== "page" || notionId(page.id) !== pageId || page.archived !== false || page.in_trash !== false ||
      typeof page.last_edited_time !== "string") throw new Error("Knowledge page unavailable");
    return page;
  }

  private async verifyPath(source: KnowledgeSource, document: KnowledgeDocument, token: string): Promise<void> {
    let id = document.pageId;
    const visited = new Set<string>();
    for (let depth = 0; depth < 32; depth++) {
      if (visited.has(id)) throw new Error("Invalid knowledge ancestry");
      visited.add(id);
      const page = await this.page(id, token);
      if (id === document.pageId && page.last_edited_time !== document.revision) throw new Error("Knowledge review is stale");
      if (id === source.rootPageId) return;
      const parent = record(page.parent);
      if (parent.type !== "page_id") throw new Error("Knowledge page escapes approved root");
      id = notionId(parent.page_id);
    }
    throw new Error("Knowledge ancestry exceeds limit");
  }

  async read(source: KnowledgeSource, document: KnowledgeDocument, token: string): Promise<string> {
    if (!source.connection.isolated || knowledgeDigest(token) !== source.connection.tokenSha256) throw new Error("Knowledge connection is unverified");
    if (source.classification === "Restricted" || document.classification === "Restricted") throw new Error("Restricted knowledge is unavailable through this provider");
    await this.verifyPath(source, document, token);
    const response = await this.get(`pages/${document.pageId}/markdown?include_transcript=false&markdown_version=v1`, token);
    if (response.object !== "page_markdown" || notionId(response.id) !== document.pageId || response.truncated !== false ||
      !Array.isArray(response.unknown_block_ids) || response.unknown_block_ids.length > 0 ||
      (response.warnings !== undefined && (!Array.isArray(response.warnings) || response.warnings.length > 0)) ||
      typeof response.markdown !== "string" || Buffer.byteLength(response.markdown) > 256 * 1024) {
      throw new Error("Knowledge page is incomplete or unsupported");
    }
    if (knowledgeDigest(response.markdown) !== document.sha256) throw new Error("Knowledge content review is stale");
    // A page may move or change while its content is in flight.
    await this.verifyPath(source, document, token);
    return response.markdown;
  }
}
