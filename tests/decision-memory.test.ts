import { chmod, mkdir, mkdtemp, readFile, readdir, realpath, stat, symlink, unlink } from "node:fs/promises";
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

async function recordConfirmed(store: LocalJsonDecisionMemoryStore, value: DecisionMemoryRecord, options: { replaceId?: string } = {}) {
  const preview = await store.record(value, options);
  return store.record(value, { ...options, confirmed: true, approvedProposalId: preview.proposal.approvalId });
}

async function forgetConfirmed(store: LocalJsonDecisionMemoryStore, id: string) {
  const preview = await store.forget(id);
  return store.forget(id, { confirmed: true, approvedProposalId: preview.proposal.approvalId });
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
      decisionRecord: { path: "/repo/docs/decisions/worktree-location.md", verified: true },
    } });
    expect(result.deviation).toEqual({ status: "documented", actual: "~/legacy-worktrees", decisionRecord: "/repo/docs/decisions/worktree-location.md" });
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
    await recordConfirmed(store, record("worktree-root", "~/worktrees"));

    const fileStats = await stat(file);
    const directoryStats = await stat(resolve(file, ".."));
    expect(fileStats.mode & 0o777).toBe(0o600);
    expect(directoryStats.mode & 0o777).toBe(0o700);
    await expect(store.list()).resolves.toHaveLength(1);
  });

  it("requires explicit replacement when a record id already exists", async () => {
    const file = join(await fixture(), "state", "decision-memory.json");
    const store = new LocalJsonDecisionMemoryStore(file);
    await recordConfirmed(store, record("worktree-root", "~/worktrees"));
    await expect(store.record(record("worktree-root", "~/other"), { confirmed: true })).rejects.toThrow("explicit replacement");
    await recordConfirmed(store, record("worktree-root", "~/other"), { replaceId: "worktree-root" });
    await expect(store.list()).resolves.toMatchObject([{ preference: "~/other" }]);
  });

  it("does not overwrite a confirmed write when writers race", async () => {
    const file = join(await fixture(), "state", "decision-memory.json");
    const store = new LocalJsonDecisionMemoryStore(file);
    const results = await Promise.allSettled([
      recordConfirmed(store, record("first", "~/first", { project: "first" })),
      recordConfirmed(store, record("second", "~/second", { project: "second" })),
    ]);

    const successfulWrites = results.filter((result) => result.status === "fulfilled").length;
    await expect(store.list()).resolves.toHaveLength(successfulWrites);
    expect(successfulWrites).toBeGreaterThan(0);
  });

  it("does not reclaim an abandoned lock automatically", async () => {
    const file = join(await fixture(), "state", "decision-memory.json");
    const store = new LocalJsonDecisionMemoryStore(file);
    const lockPath = `${file}.lock`;
    const deadPid = process.pid + 10_000;
    const { mkdir, writeFile } = await import("node:fs/promises");
    await mkdir(resolve(file, ".."), { recursive: true, mode: 0o700 });
    await writeFile(lockPath, JSON.stringify({ pid: deadPid, createdAt: "2020-01-01T00:00:00.000Z" }), { mode: 0o600 });

    await expect(recordConfirmed(store, record("worktree-root", "~/worktrees"))).rejects.toThrow("lock is stale");
    await expect(readFile(lockPath, "utf8")).resolves.toContain(String(deadPid));
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
    await recordConfirmed(store, record("worktree-root", "~/worktrees"));
    await expect(store.forget("worktree-root", { confirmed: false })).rejects.toThrow("explicit user confirmation");
    await forgetConfirmed(store, "worktree-root");
    await expect(store.list()).resolves.toEqual([]);
  });

  it("rejects unsafe directory permissions and malformed records without exposing their contents", async () => {
    const root = await fixture();
    const file = join(root, "state", "decision-memory.json");
    const store = new LocalJsonDecisionMemoryStore(file);
    await recordConfirmed(store, record("worktree-root", "~/worktrees"));
    await chmod(resolve(file, ".."), 0o755);
    await expect(store.list()).rejects.toThrow("directory permissions are unsafe");

    await chmod(resolve(file, ".."), 0o700);
    await (await import("node:fs/promises")).writeFile(file, "{\"records\":[{\"secret\":\"must-not-leak\"}]}", { mode: 0o600 });
    await expect(store.list()).rejects.toThrow("invalid decision memory data");
    await expect(store.list()).rejects.not.toThrow("must-not-leak");
    expect(await readFile(file, "utf8")).toContain("must-not-leak");
  });
});

describe.skipIf(process.platform === "win32")("mandatory write-free preference previews", () => {
  it("requires fresh approval when an ancestor symlink changes the physical destination", async () => {
    const root = await realpath(await fixture());
    const first = join(root, "first");
    const second = join(root, "second");
    const alias = join(root, "current");
    await Promise.all([mkdir(first, { mode: 0o700 }), mkdir(second, { mode: 0o700 })]);
    await symlink(first, alias);
    const store = new LocalJsonDecisionMemoryStore(join(alias, "state", "memory.json"));
    const value = record("one", "~/one");
    const preview = await store.record(value);
    expect(preview.proposal.changes[0].destination).toBe(join(first, "state", "memory.json"));
    expect(await readdir(first)).toEqual([]);

    await unlink(alias);
    await symlink(second, alias);
    await expect(store.record(value, { confirmed: true, approvedProposalId: preview.proposal.approvalId })).rejects.toThrow("missing or stale");
    expect(await readdir(first)).toEqual([]);
    expect(await readdir(second)).toEqual([]);
    const fresh = await store.record(value);
    expect(fresh.proposal.approvalId).not.toBe(preview.proposal.approvalId);
    expect(fresh.proposal.changes[0].destination).toBe(join(second, "state", "memory.json"));
    expect(await readdir(second)).toEqual([]);

    await store.record(value, { confirmed: true, approvedProposalId: fresh.proposal.approvalId });
    expect(await readFile(join(second, "state", "memory.json"), "utf8")).toBe(fresh.proposal.changes[0].after);
    expect(await readdir(join(second, "state"))).toEqual(["memory.json"]);
    expect(await readdir(first)).toEqual([]);
  });

  it("rejects dangling ancestor symlinks without initializing their targets", async () => {
    const root = await fixture();
    await symlink(join(root, "missing"), join(root, "current"));
    const store = new LocalJsonDecisionMemoryStore(join(root, "current", "state", "memory.json"));
    await expect(store.record(record("one", "~/one"))).rejects.toThrow("unresolved symbolic link");
    expect(await readdir(root)).toEqual(["current"]);
  });

  it("creates no directory, lock or file even when confirmation omits the reviewed fingerprint", async () => {
    const root = await fixture();
    const store = new LocalJsonDecisionMemoryStore(join(root, "absent", "memory.json"));
    const preview = await store.record(record("one", "~/one"));
    expect(preview.mode).toBe("dry-run");
    expect(preview.proposal.changes[0].before).toBeNull();
    expect(preview.proposal.changes[0].after).toContain("~/one");
    await expect(store.record(record("one", "~/one"), { confirmed: true })).rejects.toThrow("missing or stale");
    expect(await readdir(root)).toEqual([]);
  });

  it("preserves existing bytes and rejects changed input, state and destination before acquiring locks", async () => {
    const root = await fixture();
    const file = join(root, "state", "memory.json");
    const store = new LocalJsonDecisionMemoryStore(file);
    await recordConfirmed(store, record("one", "~/one", { project: "one" }));
    const before = await readFile(file, "utf8");
    const review = await store.record(record("two", "~/two", { project: "two" }));
    const approval = { confirmed: true, approvedProposalId: review.proposal.approvalId };
    await expect(store.record(record("two", "~/changed", { project: "two" }), approval)).rejects.toThrow("missing or stale");
    const elsewhere = new LocalJsonDecisionMemoryStore(join(root, "other", "memory.json"));
    await expect(elsewhere.record(record("two", "~/two", { project: "two" }), approval)).rejects.toThrow("missing or stale");
    expect(await readdir(root)).toEqual(["state"]);
    expect(await readFile(file, "utf8")).toBe(before);
    expect(await readdir(join(root, "state"))).toEqual(["memory.json"]);
    await recordConfirmed(store, record("three", "~/three", { project: "three" }));
    await expect(store.record(record("two", "~/two", { project: "two" }), approval)).rejects.toThrow("missing or stale");
  });

  it("previews replacements and removals, preserving all data until each reviewed change is confirmed", async () => {
    const file = join(await fixture(), "state", "memory.json");
    const store = new LocalJsonDecisionMemoryStore(file);
    await recordConfirmed(store, record("one", "~/one"));
    const before = await readFile(file, "utf8");
    const replacement = await store.record(record("one", "~/new"), { replaceId: "one" });
    const removal = await store.forget("one");
    expect(await readFile(file, "utf8")).toBe(before);
    await store.record(record("one", "~/new"), { replaceId: "one", confirmed: true, approvedProposalId: replacement.proposal.approvalId });
    await expect(store.forget("one", { confirmed: true, approvedProposalId: removal.proposal.approvalId })).rejects.toThrow("missing or stale");
    await forgetConfirmed(store, "one");
    expect(await store.list()).toEqual([]);
  });
});
