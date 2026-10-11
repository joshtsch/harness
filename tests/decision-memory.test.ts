import { chmod, mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  LocalJsonDecisionMemoryStore,
  decisionMemoryFilePath,
  resolveDecisionMemory,
  type DecisionMemoryRecord,
} from "../src/decision-memory.js";

const roots: string[] = [];
afterEach(async () => {
  const { rm } = await import("node:fs/promises");
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function fixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "harness-decision-memory-"));
  roots.push(root);
  return root;
}

function record(id: string, preference: string, scope: Omit<DecisionMemoryRecord["scope"], "user"> = {}): DecisionMemoryRecord {
  return {
    id,
    category: "worktree-location",
    scope: { user: "local", ...scope },
    preference,
    confidence: 1,
    provenance: { authority: "user-confirmed", confirmedAt: "2026-01-01T00:00:00.000Z", source: "explicit-user-confirmation" },
    reviewAfter: "2027-01-01T00:00:00.000Z",
  };
}

describe("decision memory resolution", () => {
  const query = { category: "worktree-location", scope: { user: "local", businessLine: "harness", project: "harness", environment: "development" } };

  it("uses the narrowest applicable preference and reports an undocumented project deviation", () => {
    const result = resolveDecisionMemory(query, [
      record("global", "~/worktrees"),
      record("project", "~/projects/harness-worktrees", { businessLine: "harness", project: "harness" }),
    ], { project: { actualProjectValue: "~/legacy-worktrees" } });

    expect(result.status).toBe("available");
    expect(result.preference?.id).toBe("project");
    expect(result.deviation.status).toBe("undocumented");
  });

  it("marks a project deviation documented only when a decision record is supplied", () => {
    const result = resolveDecisionMemory(query, [record("global", "~/worktrees")], { project: {
      actualProjectValue: "~/legacy-worktrees",
      decisionRecord: "docs/adr/0001-worktree-root.md",
    } });
    expect(result.deviation).toEqual({ status: "documented", actual: "~/legacy-worktrees", decisionRecord: "docs/adr/0001-worktree-root.md" });
  });

  it("fails closed on conflicting preferences at the same scope", () => {
    const result = resolveDecisionMemory(query, [record("one", "~/a"), record("two", "~/b")]);
    expect(result).toMatchObject({ status: "conflict", deviation: { status: "not-assessed" } });
    expect("preference" in result).toBe(false);
  });

  it("fails closed on incomparable applicable scopes with different preferences", () => {
    const result = resolveDecisionMemory(query, [
      record("business-line", "~/a", { businessLine: "harness" }),
      record("project", "~/b", { project: "harness" }),
    ]);
    expect(result.status).toBe("conflict");
  });

  it("marks stale preferences for reconfirmation instead of applying them", () => {
    const result = resolveDecisionMemory(query, [record("old", "~/worktrees")], { now: new Date("2027-01-02T00:00:00.000Z") });
    expect(result).toMatchObject({ status: "stale", staleRecordIds: ["old"], deviation: { status: "not-assessed" } });
    expect("preference" in result).toBe(false);
  });

  it("returns an empty result when no scoped preference matches", () => {
    const result = resolveDecisionMemory(query, [record("other-project", "~/other", { project: "other" })]);
    expect(result).toMatchObject({ status: "not-found", deviation: { status: "not-assessed" } });
    expect("preference" in result).toBe(false);
  });
});

describe.skipIf(process.platform === "win32")("local user-scoped decision memory store", () => {
  it("keeps its store outside repositories and writes owner-only data only after confirmation", async () => {
    const home = await fixture();
    const repo = resolve(home, "repo");
    const file = decisionMemoryFilePath(home);
    expect(file.startsWith(`${repo}/`)).toBe(false);

    const store = new LocalJsonDecisionMemoryStore(file);
    await expect(store.list()).resolves.toEqual([]);
    await expect(store.record(record("worktree-root", "~/worktrees"), { confirmed: false })).rejects.toThrow("explicit user confirmation");
    await store.record(record("worktree-root", "~/worktrees"), { confirmed: true });

    const fileStats = await stat(file);
    const directoryStats = await stat(resolve(file, ".."));
    expect(fileStats.mode & 0o777).toBe(0o600);
    expect(directoryStats.mode & 0o777).toBe(0o700);
    await expect(store.list()).resolves.toHaveLength(1);
  });

  it("requires explicit replacement when a record id already exists", async () => {
    const file = join(await fixture(), "state", "decision-memory.json");
    const store = new LocalJsonDecisionMemoryStore(file);
    await store.record(record("worktree-root", "~/worktrees"), { confirmed: true });
    await expect(store.record(record("worktree-root", "~/other"), { confirmed: true })).rejects.toThrow("explicit replacement");
    await store.record(record("worktree-root", "~/other"), { confirmed: true, replaceId: "worktree-root" });
    await expect(store.list()).resolves.toMatchObject([{ preference: "~/other" }]);
  });

  it("rejects likely sensitive values before writing them", async () => {
    const file = join(await fixture(), "state", "decision-memory.json");
    const store = new LocalJsonDecisionMemoryStore(file);
    await expect(store.record(record("sensitive", "contact user@example.com"), { confirmed: true }))
      .rejects.toThrow("cannot contain likely sensitive content");
    await expect(store.list()).resolves.toEqual([]);
  });

  it("requires confirmation before removing a record", async () => {
    const file = join(await fixture(), "state", "decision-memory.json");
    const store = new LocalJsonDecisionMemoryStore(file);
    await store.record(record("worktree-root", "~/worktrees"), { confirmed: true });
    await expect(store.forget("worktree-root", { confirmed: false })).rejects.toThrow("explicit user confirmation");
    await store.forget("worktree-root", { confirmed: true });
    await expect(store.list()).resolves.toEqual([]);
  });

  it("rejects unsafe directory permissions and malformed records without exposing their contents", async () => {
    const root = await fixture();
    const file = join(root, "state", "decision-memory.json");
    const store = new LocalJsonDecisionMemoryStore(file);
    await store.record(record("worktree-root", "~/worktrees"), { confirmed: true });
    await chmod(resolve(file, ".."), 0o755);
    await expect(store.list()).rejects.toThrow("directory permissions are unsafe");

    await chmod(resolve(file, ".."), 0o700);
    await (await import("node:fs/promises")).writeFile(file, "{\"records\":[{\"secret\":\"must-not-leak\"}]}", { mode: 0o600 });
    await expect(store.list()).rejects.toThrow("invalid decision memory data");
    await expect(store.list()).rejects.not.toThrow("must-not-leak");
    expect(await readFile(file, "utf8")).toContain("must-not-leak");
  });
});
