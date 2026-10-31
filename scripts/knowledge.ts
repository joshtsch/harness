#!/usr/bin/env tsx
import { createKnowledgeGateway } from "../src/knowledge-gateway.js";
import { loadKnowledgePolicy } from "../src/knowledge-policy.js";
import { handleKnowledgeRpc } from "../src/knowledge-rpc.js";

async function main(): Promise<void> {
  const command = process.argv[2];
  if (!["serve", "discover"].includes(command) || process.argv.length !== 3) throw new Error("Usage: knowledge serve|discover");
  const path = process.env.HARNESS_KNOWLEDGE_POLICY;
  const sessionId = process.env.HARNESS_KNOWLEDGE_SESSION;
  if (!path || !sessionId) throw new Error("Operator knowledge policy and session are required");
  const gateway = createKnowledgeGateway({ loadPolicy: () => loadKnowledgePolicy(path), sessionId });
  // Fail before advertising a working endpoint when launch grants are absent.
  const sources = await gateway.discover();
  if (command === "discover") {
    console.log(JSON.stringify(sources, null, 2));
    return;
  }
  let pending = "";
  for await (const chunk of process.stdin) {
    pending += String(chunk);
    if (Buffer.byteLength(pending) > 64 * 1024) throw new Error("Knowledge request exceeds limit");
    for (;;) {
      const end = pending.indexOf("\n");
      if (end === -1) break;
      const line = pending.slice(0, end);
      pending = pending.slice(end + 1);
      if (!line.trim()) continue;
      let response;
      try { response = await handleKnowledgeRpc(gateway, JSON.parse(line)); }
      catch { response = { jsonrpc: "2.0", id: null, error: { code: -32700, message: "Invalid knowledge request" } }; }
      if (response) process.stdout.write(`${JSON.stringify(response)}\n`);
    }
  }
}

try { await main(); }
catch {
  console.error("Knowledge unavailable: verify operator policy, session grants and scoped connection. No content was saved.");
  process.exitCode = 1;
}
