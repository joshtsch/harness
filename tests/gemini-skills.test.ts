import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { geminiSkillPolicyDrift, verifyGeminiContextSettings } from "../src/gemini-skills.js";
import type { CapabilityPolicy } from "../src/capability-policy.js";

const root = "/tmp/harness-gemini-test";
const policy = {
  skills: {
    active: { state: "canonical", providers: { gemini: "supported" } },
    ignored: { state: "canonical", providers: { gemini: "unavailable" } },
    dependency: { state: "available", providers: { gemini: "supported" } },
  },
} as unknown as CapabilityPolicy;

describe("Gemini skill discovery", () => {
  it("requires the shared agent instructions as Gemini context", () => {
    expect(() => verifyGeminiContextSettings({ context: { fileName: ["AGENTS.md"] } })).not.toThrow();
    expect(() => verifyGeminiContextSettings({ context: { fileName: ["GEMINI.md"] } })).toThrow("must load AGENTS.md");
  });

  it("requires an enabled project-local skill, not a global namesake", () => {
    const global = "active [Enabled]\n  Location:    /Users/example/.agents/skills/active/SKILL.md\n";
    expect(geminiSkillPolicyDrift(global, root, policy)).toEqual(["active must be enabled from this project"]);
    const local = `active [Enabled]\n  Location:    ${resolve(root, ".agents/skills/active/SKILL.md")}\n`;
    expect(geminiSkillPolicyDrift(local, root, policy)).toEqual([]);
    expect(geminiSkillPolicyDrift(local.replace("[Enabled]", "[Disabled]"), root, policy)).toEqual(["active must be enabled from this project"]);
    expect(geminiSkillPolicyDrift(`${local}ignored [Enabled]\n`, root, policy)).toEqual(["ignored must be disabled"]);
    expect(geminiSkillPolicyDrift(`${local}dependency [Enabled]\n`, root, policy)).toEqual(["dependency must be disabled"]);
  });
});
