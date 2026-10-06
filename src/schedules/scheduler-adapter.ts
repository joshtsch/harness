import type { ScheduleContract, ScheduleLifecycle } from "./schedules.js";

export interface SchedulerCapabilities {
  provider: "chatgpt-automations" | string;
  timezones: readonly string[];
  triggers: readonly ("recurrence" | "event")[];
  lifecycle: readonly ("draft" | "pause" | "cancel")[];
}

export interface SchedulerOperation {
  operation: "draft" | "pause" | "cancel";
  scheduleId: string;
  provider: string;
  reversible: true;
}

export interface SchedulerAdapter {
  capabilities(): SchedulerCapabilities;
  draft(schedule: ScheduleContract, lifecycle: ScheduleLifecycle): SchedulerOperation;
  pause(scheduleId: string): SchedulerOperation;
  cancel(scheduleId: string): SchedulerOperation;
}

function supported(capabilities: SchedulerCapabilities, schedule: ScheduleContract): void {
  if (!capabilities.timezones.includes(schedule.timezone)) throw new Error(`scheduler ${capabilities.provider} does not support timezone ${schedule.timezone}`);
  if (schedule.recurrence && !capabilities.triggers.includes("recurrence")) throw new Error("scheduler does not support recurrence triggers");
  if ((schedule.eventTriggers?.length ?? 0) > 0 && !capabilities.triggers.includes("event")) throw new Error("scheduler does not support event triggers");
}

export function createSchedulerAdapter(capabilities: SchedulerCapabilities): SchedulerAdapter {
  return {
    capabilities: () => capabilities,
    draft(schedule, lifecycle) {
      if (lifecycle.state !== "draft") throw new Error("scheduler adapter only creates draft schedules");
      supported(capabilities, schedule);
      if (!capabilities.lifecycle.includes("draft")) throw new Error(`scheduler ${capabilities.provider} does not support draft schedules`);
      return { operation: "draft", scheduleId: schedule.id, provider: capabilities.provider, reversible: true };
    },
    pause(scheduleId) {
      if (!capabilities.lifecycle.includes("pause")) throw new Error(`scheduler ${capabilities.provider} does not support pause`);
      return { operation: "pause", scheduleId, provider: capabilities.provider, reversible: true };
    },
    cancel(scheduleId) {
      if (!capabilities.lifecycle.includes("cancel")) throw new Error(`scheduler ${capabilities.provider} does not support cancel`);
      return { operation: "cancel", scheduleId, provider: capabilities.provider, reversible: true };
    },
  };
}
