import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { decideCapability, parseCapabilityPolicy, recordCapabilityUsage, routeCapability, routeMode, routeSkill, verifyCapabilityInventory } from "../src/capability-policy.js";

const catalog = `
version: 1
capabilities:
  build: { intent: build, triggers: [feature], inputs: [request], output: code, authority: modify, verification: test, group: work-shape }
  audit: { intent: audit, inputs: [session], output: findings, authority: observe, verification: evidence }
  inspect: { intent: inspect, triggers: [bug], inputs: [repository], output: diagnosis, authority: observe, verification: evidence, group: work-shape }
  style: { intent: concise prose, inputs: [session], output: prose, authority: observe, verification: meaning, kind: mode }
`;

const policy = `
version: 1
providers: [codex, gemini]
skills:
  builder: { capability: build, state: canonical, codex: supported, gemini: degraded }
  old-builder: { capability: build, state: retired, codex: unavailable, gemini: unavailable }
  alternate-builder: { capability: build, state: available, codex: supported, gemini: unavailable }
  auditor: { capability: audit, state: canonical, codex: supported, gemini: supported }
  inspector: { capability: inspect, state: canonical, codex: supported, gemini: unavailable }
  stylist: { capability: style, state: canonical, codex: supported, gemini: supported }
companions:
  build: [audit, inspect]
`;

describe("capability policy", () => {
  it("covers the lock and routes a canonical primary with an allowed companion", async () => {
    const parsed = parseCapabilityPolicy(catalog, policy);
    const root = await mkdtemp(resolve(tmpdir(), "capability-policy-"));
    const lock = resolve(root, "skills-lock.json");
    await writeFile(lock, JSON.stringify({ skills: { builder: { skillPath: "skills/builder/SKILL.md" }, "old-builder": { skillPath: "skills/old-builder/SKILL.md" }, "alternate-builder": { skillPath: "skills/alternate-builder/SKILL.md" }, auditor: { skillPath: "skills/auditor/SKILL.md" }, inspector: { skillPath: "skills/inspector/SKILL.md" }, stylist: { skillPath: "skills/stylist/SKILL.md" } } }));
    await expect(verifyCapabilityInventory(parsed, lock)).resolves.toBeUndefined();
    expect(routeCapability(parsed, "codex", "build", ["audit"])).toEqual(["builder", "auditor"]);
    expect(routeSkill(parsed, "codex", "builder")).toEqual(["builder"]);
    expect(routeMode(parsed, "gemini", "style")).toEqual(["stylist"]);
  });

  it("fails on ambiguous ownership, missing classification, and retired direct invocation", async () => {
    expect(() => parseCapabilityPolicy(catalog, policy.replace("state: retired", "state: canonical"))).toThrow("exactly one canonical");
    const parsed = parseCapabilityPolicy(catalog, policy);
    const root = await mkdtemp(resolve(tmpdir(), "capability-policy-"));
    const lock = resolve(root, "skills-lock.json");
    await writeFile(lock, JSON.stringify({ skills: { builder: { skillPath: "skills/builder/SKILL.md" }, unclassified: { skillPath: "skills/unclassified/SKILL.md" } } }));
    await expect(verifyCapabilityInventory(parsed, lock)).rejects.toThrow("skill policy/lock drift");
    expect(() => routeSkill(parsed, "codex", "old-builder")).toThrow("use builder");
    expect(() => routeSkill(parsed, "codex", "alternate-builder")).toThrow("use builder");
  });

  it("requires explicit degraded support and declared composition", () => {
    const parsed = parseCapabilityPolicy(catalog, policy);
    expect(() => routeCapability(parsed, "gemini", "build")).toThrow("degraded on gemini");
    expect(() => routeCapability(parsed, "gemini", "inspect")).toThrow("unavailable on gemini");
    expect(() => routeCapability(parsed, "codex", "audit", ["build"])).toThrow("not a companion");
    expect(() => routeCapability(parsed, "codex", "style")).toThrow("is a mode");
    expect(() => routeSkill(parsed, "codex", "stylist")).toThrow("is a mode");
    expect(routeCapability(parsed, "gemini", "build", ["audit"], true)).toEqual(["builder", "auditor"]);
    expect(() => routeCapability(parsed, "gemini", "build", ["audit", "audit"], true)).toThrow("duplicate companions");
    expect(() => routeCapability(parsed, "codex", "build", ["inspect"])).toThrow("conflicting work-shape");
    expect(() => parseCapabilityPolicy(catalog, policy.replace("build: [audit, inspect]", "build: [audit, style]"))).toThrow("invalid companion style");
  });

  it("requires every wrapper dependency to be classified", () => {
    expect(() => parseCapabilityPolicy(catalog, policy.replace("state: canonical, codex: supported, gemini: degraded", "state: canonical, requires: [missing], codex: supported, gemini: degraded"))).toThrow("requires unknown skill missing");
  });

  it("rejects a route when its upstream skill is retired or unavailable", () => {
    const withDependency = policy.replace("state: canonical, codex: supported, gemini: degraded", "state: canonical, requires: [auditor], codex: supported, gemini: degraded");
    const parsed = parseCapabilityPolicy(catalog, withDependency);
    parsed.skills.auditor!.state = "retired";
    expect(() => routeCapability(parsed, "codex", "build")).toThrow("required skill auditor is missing or retired");
    parsed.skills.auditor!.state = "canonical";
    parsed.skills.auditor!.providers.codex = "unavailable";
    expect(() => routeCapability(parsed, "codex", "build")).toThrow("auditor is unavailable on codex");
  });

  it("selects clear work intent and stops on overlap or missing signals", () => {
    const parsed = parseCapabilityPolicy(catalog, policy);
    expect(decideCapability(parsed, "build a feature")).toBe("build");
    expect(() => decideCapability(parsed, "fix a feature bug")).toThrow("build, inspect");
    expect(() => decideCapability(parsed, "improve the code")).toThrow("no match");
  });

  it("records only redacted usage metadata after a valid route", async () => {
    const parsed = parseCapabilityPolicy(catalog, policy);
    const root = await mkdtemp(resolve(tmpdir(), "capability-usage-"));
    const path = resolve(root, "nested", "usage.jsonl");
    await recordCapabilityUsage(parsed, "codex", "build", path);
    const event = JSON.parse((await readFile(path, "utf8")).trim());
    expect(event).toEqual({ version: 1, at: expect.any(String), provider: "codex", capability: "build", kind: "task", companions: [], skills: ["builder"] });
    await recordCapabilityUsage(parsed, "codex", "build", path, ["audit"]);
    await recordCapabilityUsage(parsed, "codex", "style", path);
    const events = (await readFile(path, "utf8")).trim().split("\n").map((line) => JSON.parse(line));
    const companionEvent = events[1];
    expect(companionEvent).toMatchObject({ capability: "build", companions: ["audit"], skills: ["builder", "auditor"] });
    expect(events[2]).toMatchObject({ capability: "style", kind: "mode", skills: ["stylist"] });
    await expect(recordCapabilityUsage(parsed, "codex", "style", path, ["audit"])).rejects.toThrow("modes cannot have companions");
    await expect(recordCapabilityUsage(parsed, "gemini", "inspect", path)).rejects.toThrow("unavailable on gemini");
    expect((await readFile(path, "utf8")).trim().split("\n")).toHaveLength(3);
  });
});
