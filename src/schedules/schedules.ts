export type ScheduleState = "draft" | "active" | "paused" | "cancelled";
export type DstPolicy = "skip" | "shift_forward" | "run_once";
export type MissedRunPolicy = "skip" | "run_once" | "queue";
export type DuplicateRunPolicy = "skip" | "replace";

export interface ScheduleRecurrence {
  frequency: "hourly" | "daily" | "weekly" | "monthly";
  interval: number;
  at?: string;
  daysOfWeek?: readonly number[];
}

export interface ScheduleWindow {
  start: string;
  end: string;
}

export interface ScheduleContract {
  id: string;
  version: string;
  timezone: string;
  dstPolicy: DstPolicy;
  recurrence?: ScheduleRecurrence;
  eventTriggers?: readonly string[];
  window?: ScheduleWindow;
  missedRunPolicy: MissedRunPolicy;
  retry: { maxAttempts: number; backoffSeconds: number };
  timeoutSeconds: number;
  duplicateRunPolicy: DuplicateRunPolicy;
  notificationEvents: readonly string[];
}

export interface ScheduleLifecycle {
  state: ScheduleState;
  approved: boolean;
  authorized: boolean;
}

const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const dstPolicies = new Set<DstPolicy>(["skip", "shift_forward", "run_once"]);
const missedRunPolicies = new Set<MissedRunPolicy>(["skip", "run_once", "queue"]);
const duplicateRunPolicies = new Set<DuplicateRunPolicy>(["skip", "replace"]);
const recurrenceFrequencies = new Set<ScheduleRecurrence["frequency"]>(["hourly", "daily", "weekly", "monthly"]);

function requiredText(value: string, label: string): void {
  if (value.trim() === "" || value.includes("\n")) throw new Error(`${label} must be a single non-empty line`);
}

function validateTimezone(timezone: string): void {
  requiredText(timezone, "schedule.timezone");
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format();
  } catch {
    throw new Error("schedule.timezone must be a valid IANA timezone");
  }
}

function validateTime(value: string, label: string): void {
  if (!timePattern.test(value)) throw new Error(`${label} must use HH:MM format`);
}

export function validateSchedule(contract: ScheduleContract): void {
  requiredText(contract.id, "schedule.id");
  requiredText(contract.version, "schedule.version");
  validateTimezone(contract.timezone);
  if (!dstPolicies.has(contract.dstPolicy)) throw new Error("schedule.dstPolicy is not supported");
  if (!missedRunPolicies.has(contract.missedRunPolicy)) throw new Error("schedule.missedRunPolicy is not supported");
  if (!duplicateRunPolicies.has(contract.duplicateRunPolicy)) throw new Error("schedule.duplicateRunPolicy is not supported");
  if (contract.recurrence === undefined && (contract.eventTriggers ?? []).length === 0) {
    throw new Error("schedule must define a recurrence or event trigger");
  }
  if (contract.recurrence) {
    if (!recurrenceFrequencies.has(contract.recurrence.frequency)) {
      throw new Error("schedule.recurrence.frequency is not supported");
    }
    if (!Number.isInteger(contract.recurrence.interval) || contract.recurrence.interval < 1) {
      throw new Error("schedule.recurrence.interval must be a positive integer");
    }
    if (contract.recurrence.at !== undefined) validateTime(contract.recurrence.at, "schedule.recurrence.at");
    for (const day of contract.recurrence.daysOfWeek ?? []) {
      if (!Number.isInteger(day) || day < 0 || day > 6) throw new Error("schedule.recurrence.daysOfWeek must contain 0 through 6");
    }
  }
  for (const trigger of contract.eventTriggers ?? []) requiredText(trigger, "schedule.eventTriggers entry");
  if (contract.window) {
    validateTime(contract.window.start, "schedule.window.start");
    validateTime(contract.window.end, "schedule.window.end");
  }
  if (!Number.isInteger(contract.retry.maxAttempts) || contract.retry.maxAttempts < 1) {
    throw new Error("schedule.retry.maxAttempts must be a positive integer");
  }
  if (!Number.isFinite(contract.retry.backoffSeconds) || contract.retry.backoffSeconds < 0) {
    throw new Error("schedule.retry.backoffSeconds must be non-negative and finite");
  }
  if (!Number.isFinite(contract.timeoutSeconds) || contract.timeoutSeconds <= 0) {
    throw new Error("schedule.timeoutSeconds must be positive and finite");
  }
  for (const event of contract.notificationEvents) requiredText(event, "schedule.notificationEvents entry");
}

export function transitionSchedule(
  lifecycle: ScheduleLifecycle,
  nextState: ScheduleState,
): ScheduleLifecycle {
  if (lifecycle.state === "cancelled") throw new Error("cancelled schedules cannot transition");
  if (nextState === "active" && (!lifecycle.approved || !lifecycle.authorized)) {
    throw new Error("active schedules require approval and authorization");
  }
  if (nextState === "draft" && lifecycle.state !== "draft") throw new Error("only draft schedules can return to draft");
  if (nextState === lifecycle.state) return lifecycle;
  if (nextState === "paused" && lifecycle.state !== "active") throw new Error("only active schedules can be paused");
  if (nextState === "active" && lifecycle.state !== "draft" && lifecycle.state !== "paused") {
    throw new Error("only draft or paused schedules can become active");
  }
  return { ...lifecycle, state: nextState };
}
