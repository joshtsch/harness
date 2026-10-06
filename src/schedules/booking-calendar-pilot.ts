import { createHash } from "node:crypto";
import { canExecute, type RoutineAuthorization } from "../routines/index.js";

export interface Booking {
  id: string;
  checkIn: string;
  checkOut: string;
  title?: string;
}

export interface CalendarDraft {
  idempotencyKey: string;
  bookingId: string;
  start: string;
  end: string;
  title: string;
}

export interface BookingPilotPlan {
  enabled: false;
  drafts: readonly CalendarDraft[];
  duplicates: readonly string[];
  ambiguities: readonly string[];
  recovery: string;
}

function date(value: string, label: string): Date {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new Error(`${label} must be a valid date`);
  return parsed;
}

function key(booking: Booking): string {
  return createHash("sha256").update(`${booking.id}|${booking.checkIn}|${booking.checkOut}`).digest("hex").slice(0, 24);
}

export function planBookingCalendarChanges(bookings: readonly Booking[], existingIdempotencyKeys: readonly string[] = []): BookingPilotPlan {
  const seen = new Set<string>();
  const existing = new Set(existingIdempotencyKeys);
  const drafts: CalendarDraft[] = [];
  const duplicates: string[] = [];
  const ambiguities: string[] = [];
  for (const booking of bookings) {
    if (booking.id.trim() === "") throw new Error("booking.id must be non-empty");
    const start = date(booking.checkIn, "booking.checkIn");
    const end = date(booking.checkOut, "booking.checkOut");
    if (end <= start) { ambiguities.push(booking.id); continue; }
    const idempotencyKey = key(booking);
    if (seen.has(idempotencyKey) || existing.has(idempotencyKey)) { duplicates.push(booking.id); continue; }
    seen.add(idempotencyKey);
    drafts.push({ idempotencyKey, bookingId: booking.id, start: start.toISOString(), end: end.toISOString(), title: booking.title ?? "Booking" });
  }
  return { enabled: false, drafts, duplicates, ambiguities, recovery: "Review the dry-run plan, revoke authorization, or remove drafts before any write pilot." };
}

export function canEnableBookingCalendarWrites(authorization: RoutineAuthorization): boolean {
  return authorization.sideEffectClass === "external" && authorization.approved && canExecute(authorization);
}
