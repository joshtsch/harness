import { afterEach, describe, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import { createKnowledgeGateway } from "../src/knowledge-gateway.js";
import { parseKnowledgePolicy, type KnowledgePolicy } from "../src/knowledge-policy.js";
import { knowledgeDigest, NotionKnowledgeProvider } from "../src/notion-knowledge.js";
import { handleKnowledgeRpc } from "../src/knowledge-rpc.js";
import { loadKnowledgePolicy } from "../src/knowledge-policy.js";
import { mkdtemp, writeFile, chmod, symlink, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const now = Date.parse("2026-10-30T12:00:00Z");
const expiresAt = "2026-11-01T00:00:00Z";
const revision = "2026-10-29T12:00:00.000Z";
const id = (n: number) => n.toString(16).padStart(32, "a");
const token = "fixture";
const content = "# Experience\n\nA synthetic engineering example.\n";
const servers: Server[] = [];
afterEach(async () => { await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve, reject) => {
  server.closeAllConnections();
  server.close((error) => error ? reject(error) : resolve());
}))); });

function policy(): KnowledgePolicy {
  return parseKnowledgePolicy({
    version: 1,
    sources: Object.fromEntries(["experience", "role"].map((name, index) => [name, {
      provider: "notion", classification: index === 0 ? "Private" : "Public", subject: "local", enabled: true, expiresAt,
      purposes: ["career"], processors: ["codex/openai"], rootPageId: id(1), tokenEnvironment: "NOTION_FIXTURE_TOKEN",
      connection: { isolated: true, tokenSha256: knowledgeDigest(token), expiresAt },
      documents: { summary: { pageId: id(index + 2), classification: index === 0 ? "Private" : "Public", revision, sha256: knowledgeDigest(content), status: index === 0 ? "historical" : "current" } },
    }])),
    sessions: { chat: { subject: "local", processor: "codex/openai", purpose: "career", execution: "interactive", userRequested: true, expiresAt, sources: ["experience", "role"] } },
  });
}

interface ApiOptions { metadata?: (page: Record<string, unknown>) => void; markdown?: (page: Record<string, unknown>) => void; afterRead?: () => void; status?: number }
async function fixture(options: ApiOptions = {}) {
  const requests: { path: string; version: string | undefined }[] = [];
  const server = createServer((request, response) => {
    requests.push({ path: request.url!, version: request.headers["notion-version"] as string | undefined });
    response.setHeader("Content-Type", "application/json");
    if (options.status) { response.writeHead(options.status); response.end(JSON.stringify({ message: "PRIVATE_PAYLOAD_MUST_NOT_ESCAPE" })); return; }
    const pageId = request.url!.split("/")[3];
    if (request.url!.includes("/markdown")) {
      const value = { object: "page_markdown", id: pageId, markdown: content, truncated: false, unknown_block_ids: [] };
      options.markdown?.(value);
      options.afterRead?.();
      response.end(JSON.stringify(value));
    } else {
      const value = { object: "page", id: pageId, archived: false, in_trash: false, last_edited_time: revision, parent: { type: "page_id", page_id: id(1) } };
      options.metadata?.(value);
      response.end(JSON.stringify(value));
    }
  });
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  servers.push(server);
  const address = server.address() as { port: number };
  const request: typeof fetch = async (url, init) => fetch(`http://127.0.0.1:${address.port}${new URL(String(url)).pathname}${new URL(String(url)).search}`, init);
  return { requests, provider: new NotionKnowledgeProvider(request) };
}

function gateway(current: () => KnowledgePolicy, provider: NotionKnowledgeProvider) {
  return createKnowledgeGateway({ loadPolicy: async () => structuredClone(current()), sessionId: "chat", environment: { NOTION_FIXTURE_TOKEN: token }, provider, now: () => now });
}

describe("authorized source set through the knowledge gateway", () => {
  it("preserves a Private source classification even when its document is Public", async () => {
    const current = policy();
    Object.assign(current.sources.role, { classification: "Private" });
    const api = await fixture();
    const client = gateway(() => current, api.provider);
    const result = await client.read([{ source: "role", document: "summary" }]);
    expect(result.classification).toBe("Private");
    expect(result.documents[0].classification).toBe("Private");
    expect(await client.discover()).toContainEqual(expect.objectContaining({ source: "role", classification: "Private" }));
  });

  it("combines selected sources with citations, historical status and the highest classification", async () => {
    const api = await fixture();
    const current = policy();
    const result = await gateway(() => current, api.provider).read([{ source: "experience", document: "summary" }, { source: "role", document: "summary" }]);
    expect(result.classification).toBe("Private");
    expect(result.documents.map((entry) => [entry.source, entry.content, entry.status])).toEqual([["experience", content, "historical"], ["role", content, "current"]]);
    expect(result.documents[0].citation).toEqual({ url: `https://www.notion.so/${id(2)}`, revision, sha256: knowledgeDigest(content), retrievedAt: "2026-10-30T12:00:00.000Z" });
    expect(api.requests.every((request) => request.version === "2026-" + "03-11")).toBe(true);
    expect(api.requests.filter((request) => request.path.includes("markdown"))).toHaveLength(2);
  });

  it.each(["removed", "expired-session", "background", "unrequested", "processor", "subject", "purpose", "revoked", "expired-source", "unverified", "expired-connection", "restricted", "restricted-source"])("denies %s before any network request", async (reason) => {
    const api = await fixture();
    const current = policy();
    const session = current.sessions.chat;
    const source = current.sources.experience;
    switch (reason) {
      case "removed": session.sources = ["role"]; break;
      case "expired-session": session.expiresAt = "2026-10-30T12:00:00Z"; break;
      case "background": session.execution = "background"; break;
      case "unrequested": session.userRequested = false; break;
      case "processor": session.processor = "other/provider"; break;
      case "subject": session.subject = "other"; break;
      case "purpose": session.purpose = "project-work"; break;
      case "revoked": source.enabled = false; break;
      case "expired-source": source.expiresAt = "2026-10-30T11:59:59Z"; break;
      case "unverified": source.connection.isolated = false; break;
      case "expired-connection": source.connection.expiresAt = "2026-10-30T11:59:59Z"; break;
      case "restricted": source.documents.summary.classification = "Restricted"; break;
      case "restricted-source": source.classification = "Restricted"; break;
    }
    await expect(gateway(() => current, api.provider).read([{ source: "experience", document: "summary" }])).rejects.toThrow();
    expect(api.requests).toEqual([]);
  });

  it("honors source-set edits and releases nothing when a grant changes in flight", async () => {
    const current = policy();
    const api = await fixture({ afterRead: () => { current.sessions.chat.sources = ["role"]; } });
    const client = gateway(() => current, api.provider);
    await expect(client.read([{ source: "experience", document: "summary" }])).rejects.toThrow("denied");
    expect((await client.discover()).map((entry) => entry.source)).toEqual(["role"]);
  });

  it("rejects caller-supplied processor assertions at the tool boundary", async () => {
    const api = await fixture();
    const current = policy();
    const response = await handleKnowledgeRpc(gateway(() => current, api.provider), { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "knowledge_read", arguments: { selections: [{ source: "experience", document: "summary" }], processor: "codex/openai" } } });
    expect(JSON.stringify(response)).toContain("error");
    expect(JSON.stringify(response)).not.toContain(content);
    expect(api.requests).toEqual([]);
  });

  it("preflights every requested source before releasing any part of a batch", async () => {
    const current = policy();
    current.sources.role.documents.summary.classification = "Restricted";
    const api = await fixture();
    await expect(gateway(() => current, api.provider).read([{ source: "experience", document: "summary" }, { source: "role", document: "summary" }])).rejects.toThrow("not approved");
    expect(api.requests).toEqual([]);
  });

  it("exposes the authorized source set and cited content through the MCP boundary", async () => {
    const api = await fixture();
    const current = policy();
    const client = gateway(() => current, api.provider);
    const initialize = await handleKnowledgeRpc(client, { jsonrpc: "2.0", id: 1, method: "initialize" });
    expect(initialize).toMatchObject({ result: { capabilities: { tools: {} } } });
    const discovery = await handleKnowledgeRpc(client, { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "knowledge_discover", arguments: {} } });
    expect(JSON.stringify(discovery)).toContain("experience");
    expect(JSON.stringify(discovery)).not.toContain(token);
    const response = await handleKnowledgeRpc(client, { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "knowledge_read", arguments: { selections: [{ source: "experience", document: "summary" }] } } });
    const result = response!.result as { content: { text: string }[] };
    expect(JSON.parse(result.content[0].text)).toMatchObject({ classification: "Private", documents: [{ content, citation: { revision } }] });
  });
});

describe("Notion retrieval boundary", () => {
  it.each(["escaped", "stale-revision", "archived", "wrong-id", "truncated", "unknown-blocks", "warnings", "changed-content", "rotated-token", "denied"])("rejects %s without returning content", async (reason) => {
    const current = policy();
    if (reason === "rotated-token") current.sources.experience.connection.tokenSha256 = "f".repeat(64);
    const api = await fixture({
      status: reason === "denied" ? 403 : undefined,
      metadata: (page) => {
        if (reason === "escaped") page.parent = { type: "workspace", workspace: true };
        if (reason === "stale-revision") page.last_edited_time = "2026-10-30T00:00:00Z";
        if (reason === "archived") page.archived = true;
        if (reason === "wrong-id") page.id = id(9);
      },
      markdown: (page) => {
        if (reason === "truncated") page.truncated = true;
        if (reason === "unknown-blocks") page.unknown_block_ids = [id(8)];
        if (reason === "warnings") page.warnings = [{ message: "PRIVATE_PAYLOAD_MUST_NOT_ESCAPE" }];
        if (reason === "changed-content") page.markdown = "PRIVATE_PAYLOAD_MUST_NOT_ESCAPE";
      },
    });
    let message = "";
    try { await gateway(() => current, api.provider).read([{ source: "experience", document: "summary" }]); }
    catch (error) { message = (error as Error).message; }
    expect(message).not.toBe("");
    expect(message).not.toContain("PRIVATE_PAYLOAD_MUST_NOT_ESCAPE");
    expect(message).not.toContain(token);
    if (reason === "rotated-token") expect(api.requests).toEqual([]);
  });

  it("rejects a page moved outside the root while Markdown is in flight", async () => {
    let moved = false;
    const api = await fixture({ afterRead: () => { moved = true; }, metadata: (page) => { if (moved) page.parent = { type: "workspace", workspace: true }; } });
    await expect(gateway(policy, api.provider).read([{ source: "experience", document: "summary" }])).rejects.toThrow("escapes");
  });

  it("bounds provider responses without leaking the oversized body", async () => {
    const api = await fixture({ markdown: (page) => { page.markdown = "PRIVATE_PAYLOAD".repeat(50_000); } });
    await expect(gateway(policy, api.provider).read([{ source: "experience", document: "summary" }])).rejects.toThrow("limit");
  });
});

describe("operator policy and executable gateway", () => {
  it("loads operator-only policy, rejects permissive files and symlinks, and runs discovery without saving content", async () => {
    const directory = await mkdtemp(join(tmpdir(), "harness-knowledge-"));
    const path = join(directory, "policy.json");
    try {
      await writeFile(path, JSON.stringify(policy()), { mode: 0o600 });
      const client = createKnowledgeGateway({ loadPolicy: () => loadKnowledgePolicy(path), sessionId: "chat", now: () => now });
      expect((await client.discover()).map((entry) => entry.source)).toEqual(["experience", "role"]);
      const executablePolicy = policy();
      executablePolicy.sessions.chat.expiresAt = new Date(Date.now() + 60_000).toISOString();
      executablePolicy.sessions.chat.sources = [];
      await writeFile(path, JSON.stringify(executablePolicy));
      const result = await promisify(execFile)(process.execPath, ["--import", "tsx", "scripts/knowledge.ts", "discover"], {
        cwd: process.cwd(), env: { ...process.env, HARNESS_KNOWLEDGE_POLICY: path, HARNESS_KNOWLEDGE_SESSION: "chat" },
      });
      expect(JSON.parse(result.stdout)).toEqual([]);
      expect(result.stderr).toBe("");
      await chmod(path, 0o644);
      await expect(client.discover()).rejects.toThrow("unavailable or invalid");
      await chmod(path, 0o600);
      const link = join(directory, "linked-policy.json");
      await symlink(path, link);
      await expect(loadKnowledgePolicy(link)).rejects.toThrow("unavailable or invalid");
      await writeFile(path, "PRIVATE_INVALID_JSON");
      await expect(loadKnowledgePolicy(path)).rejects.toThrow("Knowledge policy unavailable or invalid");
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
});
