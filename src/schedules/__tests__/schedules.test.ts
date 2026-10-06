import { describe, expect, it } from "vitest";
import { transitionSchedule, validateSchedule, type ScheduleContract } from "../index.js";

const contract: ScheduleContract = {
  id: "booking-report",
  version: "1",
  timezone: "America/Toronto",
  dstPolicy: "shift_forward",
  recurrence: { frequency: "weekly", interval: 1, at: "09:30", daysOfWeek: [1, 3, 5] },
  window: { start: "09:00", end: "17:00" },
  missedRunPolicy: "run_once",
  retry: { maxAttempts: 3, backoffSeconds: 30 },
  timeoutSeconds: 120,
  duplicateRunPolicy: "skip",
  notificationEvents: ["failure", "approval_required"],
};

describe("schedule contracts", () => {
  it("validates explicit timezone and deterministic run policies", () => {
    expect(() => validateSchedule(contract)).not.toThrow();
    expect(() => validateSchedule({ ...contract, timezone: "not-a-timezone" })).toThrow("valid IANA timezone");
    expect(() => validateSchedule({ ...contract, dstPolicy: "later" as ScheduleContract["dstPolicy"] })).toThrow(
      "schedule.dstPolicy is not supported",
    );
    expect(() => validateSchedule({ ...contract, recurrence: undefined, eventTriggers: [] })).toThrow(
      "recurrence or event trigger",
    );
  });

  it("supports event-triggered schedules without a recurrence", () => {
    expect(() => validateSchedule({ ...contract, recurrence: undefined, eventTriggers: ["booking.updated"] })).not.toThrow();
  });
});

describe("schedule lifecycle", () => {
  it("starts in draft and requires both approval and authorization to activate", () => {
    const draft = { state: "draft" as const, approved: true, authorized: false };
    expect(() => transitionSchedule(draft, "active")).toThrow("approval and authorization");
    const active = transitionSchedule({ ...draft, authorized: true }, "active");
    expect(active.state).toBe("active");
    expect(transitionSchedule(active, "paused").state).toBe("paused");
    expect(transitionSchedule({ ...active, state: "paused" }, "active").state).toBe("active");
  });

  it("makes cancellation terminal", () => {
    const cancelled = transitionSchedule({ state: "draft", approved: false, authorized: false }, "cancelled");
    expect(() => transitionSchedule(cancelled, "draft")).toThrow("cannot transition");
  });
});
