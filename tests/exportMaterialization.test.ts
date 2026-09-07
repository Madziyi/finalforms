import { describe, expect, it } from "vitest";
import { materializeExportValues } from "../worker/domain/exportMaterialization";

const sources = {
  form9Oat: [
    { date: "2026-09-06", timeSlot: "03:00", status: "completed", values: { oat_memorial: 71 } },
    { date: "2026-09-06", timeSlot: "11:00", status: "completed", values: { oat_memorial: 87 } },
    { date: "2026-09-06", timeSlot: "15:00", status: "draft", values: { oat_memorial: 99 } }
  ],
  form5Projections: [
    { plantDate: "2026-09-05", status: "current", values: { total_steam: 900, makeup_water_gallon: 120 } },
    { plantDate: "2026-09-06", status: "current", values: { total_steam: 1000, makeup_water_gallon: 140 } }
  ]
};

describe("export display-value materialization", () => {
  it("adds same-date completed Form 9 extrema to a Form 8 export row", () => {
    expect(materializeExportValues("integrator-readings", "2026-09-06", null, { softener1: 10 }, sources)).toMatchObject({
      softener1: 10, oat_high: 87, oat_low: 71
    });
  });

  it("uses Form 5 on the Night date and prior Form 5 on the Day date for Form 2 exports", () => {
    expect(materializeExportValues("boiler-water-control-tests", "2026-09-06", "Night", {}, sources)).toMatchObject({ steam_total: 1000, makeup_total: 140 });
    expect(materializeExportValues("boiler-water-control-tests", "2026-09-06", "Day", {}, sources)).toMatchObject({ steam_total: 900, makeup_total: 120 });
  });

  it("leaves display-only fields blank for Extra shift or missing eligible sources", () => {
    expect(materializeExportValues("boiler-water-control-tests", "2026-09-06", "Extra", { steam_total: 5, makeup_total: 6 }, sources)).toMatchObject({ steam_total: null, makeup_total: null });
    expect(materializeExportValues("integrator-readings", "2026-09-07", null, {}, sources)).toMatchObject({ oat_high: null, oat_low: null });
  });

  it("does not change stored Form 5 projection values", () => {
    const values = { oat_high: 87, oat_low: 71, total_steam: 1000 };
    expect(materializeExportValues("daily-consumption-totals", "2026-09-06", null, values, sources)).toEqual(values);
  });
});
