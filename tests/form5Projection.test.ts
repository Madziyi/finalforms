import { describe, expect, it } from "vitest";
import { applyForm5OatExtrema, sourceRefs } from "../worker/domain/derivations";
import type { OatSourceRecord } from "../shared/form8Oat";

function source(timeSlot: string, value: unknown, extra: Partial<OatSourceRecord> = {}): OatSourceRecord {
  return {
    date: "2026-09-06",
    timeSlot,
    values: { oat_memorial: value as any },
    status: "completed",
    lifecycle: "completed",
    ...extra,
  };
}

describe("server Form 5 OAT projection", () => {
  it("uses the highest and lowest completed partial Form 9 slot readings", () => {
    expect(applyForm5OatExtrema(
      { oat_high: 999, oat_low: -999, total_steam: 42 },
      [source("03:00", 74), source("11:00", 91), source("19:00", 68)],
      "2026-09-06",
    )).toEqual({ oat_high: 91, oat_low: 68, total_steam: 42 });
  });

  it("blanks both fields when there is no eligible Form 9 OAT instead of retaining Form 8 values", () => {
    expect(applyForm5OatExtrema(
      { oat_high: 88, oat_low: 61 },
      [
        source("03:00", null),
        source("07:00", "80"),
        source("11:00", 75, { date: "2026-09-05" }),
        source("15:00", 94, { status: "draft" }),
        source("19:00", 95, { temporaryEdit: true }),
      ],
      "2026-09-06",
    )).toEqual({ oat_high: null, oat_low: null });
  });

  it("accepts the valid revision for a duplicate slot while ignoring the invalid duplicate", () => {
    expect(applyForm5OatExtrema(
      {},
      [source("03:00", null), source("03:00", 82), source("07:00", 77)],
      "2026-09-06",
    )).toMatchObject({ oat_high: 82, oat_low: 77 });
  });

  it("keeps Form 9 source revisions alongside Form 8 source revisions", () => {
    expect(sourceRefs([
      { revision_id: "F08-2026-09-06@r4", aggregate_id: "F08-2026-09-06", revision: 4, plant_date: "2026-09-06", values_json: "{}" },
      { revision_id: "F09-2026-09-06-0300@r2", aggregate_id: "F09-2026-09-06-0300", revision: 2, plant_date: "2026-09-06", values_json: "{}" },
    ])).toEqual([
      { aggregateId: "F08-2026-09-06", revisionId: "F08-2026-09-06@r4", revision: 4, plantDate: "2026-09-06" },
      { aggregateId: "F09-2026-09-06-0300", revisionId: "F09-2026-09-06-0300@r2", revision: 2, plantDate: "2026-09-06" },
    ]);
  });
});
