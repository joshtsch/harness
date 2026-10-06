import { describe, expect, it } from "vitest";
import { authorizeRoutine, revokeAuthorization } from "../../routines/index.js";
import { canEnableBookingCalendarWrites, planBookingCalendarChanges } from "../index.js";

describe("booking calendar pilot", () => {
  it("plans dry-run changes with idempotency and ambiguity reporting", () => {
    const booking = { id: "booking-1", checkIn: "2026-10-01T15:00:00Z", checkOut: "2026-10-03T11:00:00Z" };
    const plan = planBookingCalendarChanges([booking, booking, { ...booking, id: "bad", checkIn: "2026-10-04", checkOut: "2026-10-03" }]);
    expect(plan).toMatchObject({ enabled: false, drafts: [{ bookingId: "booking-1" }], duplicates: ["booking-1"], ambiguities: ["bad"] });
  });

  it("requires scoped active authorization before calendar writes", () => {
    const auth = authorizeRoutine({ routineId: "booking-calendar", tier: "draft", sideEffectClass: "external", scope: "calendar:company" });
    expect(canEnableBookingCalendarWrites(auth)).toBe(true);
    expect(canEnableBookingCalendarWrites(revokeAuthorization(auth, "human", "disabled").authorization)).toBe(false);
  });
});
