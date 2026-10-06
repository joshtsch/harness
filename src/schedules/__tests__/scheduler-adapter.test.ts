import { describe, expect, it } from "vitest";
import { createSchedulerAdapter } from "../index.js";
import type { ScheduleContract } from "../index.js";

const schedule: ScheduleContract = { id: "report", version: "1", timezone: "America/Toronto", dstPolicy: "shift_forward", recurrence: { frequency: "daily", interval: 1 }, missedRunPolicy: "skip", retry: { maxAttempts: 1, backoffSeconds: 0 }, timeoutSeconds: 30, duplicateRunPolicy: "skip", notificationEvents: [] };
const adapter = createSchedulerAdapter({ provider: "chatgpt-automations", timezones: ["America/Toronto"], triggers: ["recurrence"], lifecycle: ["draft", "pause", "cancel"] });

describe("scheduler adapter", () => {
  it("keeps scheduling provider-neutral and draft-only", () => {
    expect(adapter.draft(schedule, { state: "draft", approved: false, authorized: false })).toEqual({ operation: "draft", scheduleId: "report", provider: "chatgpt-automations", reversible: true });
    expect(adapter.pause("report").operation).toBe("pause");
    expect(adapter.cancel("report").operation).toBe("cancel");
  });

  it("fails clearly for unsupported host capabilities", () => {
    const unsupported = createSchedulerAdapter({ provider: "chatgpt-automations", timezones: ["UTC"], triggers: [], lifecycle: ["draft"] });
    expect(() => unsupported.draft(schedule, { state: "draft", approved: false, authorized: false })).toThrow("timezone");
    expect(() => unsupported.pause("report")).toThrow("pause");
  });
});
