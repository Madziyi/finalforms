import { describe, expect, it } from "vitest";
import { deriveForm8OatExtrema, type OatSourceRecord } from "../shared/form8Oat";

const record = (timeSlot: string, oat: unknown, extra: Record<string, unknown> = {}) => ({
  date: "2026-09-06", timeSlot, values: { oat_memorial: oat }, status: "completed", ...extra
}) as OatSourceRecord;

describe("Form 8 OAT extrema", () => {
  it("uses completed slots only across any completed subset", () => {
    expect(deriveForm8OatExtrema([
      record("03:00", 72), record("11:00", 91), record("15:00", 55, { status: "draft" }), record("19:00", 10, { temporaryEdit: true })
    ], "2026-09-06", "oat_memorial")).toEqual({ status: "ready", values: { oat_high: 91, oat_low: 72 } });
  });

  it("ignores blank and non-numeric readings and hides when none are eligible", () => {
    expect(deriveForm8OatExtrema([
      record("03:00", null), record("07:00", "80"), record("11:00", 75, { date: "2026-09-05" })
    ], "2026-09-06", "oat_memorial")).toEqual({ status: "hidden", values: {} });
  });

  it("uses one reading per time slot", () => {
    expect(deriveForm8OatExtrema([
      record("03:00", 70), record("03:00", 90), record("07:00", 82)
    ], "2026-09-06", "oat_memorial")).toEqual({ status: "ready", values: { oat_high: 82, oat_low: 70 } });
  });
});
