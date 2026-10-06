import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { assertSkillCompatible, getModeDefinition, loadSessionModeState, modeStatePath, saveSessionModeState, selectMode, transitionMode } from "../index.js";

describe("context modes", () => {
  it("defines all initial modes and their contracts", () => {
    expect(getModeDefinition("implementation")).toMatchObject({ mode: "implementation", allowedActions: expect.any(Array), verification: expect.any(Array) });
    expect(getModeDefinition("review").blockedActions).toContain("merge without approval");
  });

  it("records manual selection and explicit transitions", () => {
    const selected = selectMode("research");
    expect(transitionMode(selected, "implementation")).toEqual({
      activeMode: "implementation",
      transitions: [
        { to: "research", source: "manual" },
        { from: "research", to: "implementation", source: "manual" },
      ],
    });
  });

  it("blocks skills incompatible with the active mode", () => {
    expect(() => assertSkillCompatible("review", "implement")).toThrow("incompatible");
    expect(() => assertSkillCompatible("implementation", "implement")).not.toThrow();
  });

  it("persists and reloads resolved mode state", async () => {
    const root = await mkdtemp(join(tmpdir(), "harness-modes-"));
    try {
      await mkdir(join(root, "docs", ".scratch", "setup", "session-1"), { recursive: true });
      const state = transitionMode(selectMode("triage"), "research");
      await saveSessionModeState(root, "session-1", state);
      await expect(loadSessionModeState(root, "session-1")).resolves.toEqual(state);
      expect(modeStatePath(root, "session-1")).toContain("mode.json");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
