import { describe, expect, it } from "vitest";
import { calculateDerivedProjections, projectionRefreshDatesFromRows, type DerivedSourceRow } from "../worker/domain/derivations";

function source(date: string, values: Record<string, unknown>, revision = 1): DerivedSourceRow {
  return { revision_id: `form8-${date}@r${revision}`, aggregate_id: `form8-${date}`, revision, plant_date: date, values_json: JSON.stringify(values) };
}

describe("historical projection successor closure", () => {
  it("recomputes D, D+1, and each field's next later nonblank occurrence", () => {
    const rows = [
      source("2026-09-07", { gas_boiler3: 100, steam_boiler3: 200, gas_boiler4: 300, steam_boiler4: 400 }),
      source("2026-09-08", { gas_boiler3: null, steam_boiler3: null, gas_boiler4: null, steam_boiler4: null }),
      source("2026-09-09", { gas_boiler3: 110, steam_boiler3: null, gas_boiler4: null, steam_boiler4: null }),
      source("2026-09-10", { gas_boiler3: null, steam_boiler3: 220, gas_boiler4: 330, steam_boiler4: null }),
      source("2026-09-11", { gas_boiler3: null, steam_boiler3: null, gas_boiler4: null, steam_boiler4: 440 }),
      source("2026-09-12", { gas_boiler3: 120, steam_boiler3: 240, gas_boiler4: 360, steam_boiler4: 480 }),
    ];

    expect(projectionRefreshDatesFromRows(["2026-09-07"], rows)).toEqual([
      "2026-09-07", "2026-09-08", "2026-09-09", "2026-09-10", "2026-09-11",
    ]);
  });

  it("records the actual independent prior source date and revision", () => {
    const rows = [
      source("2026-09-04", { gas_boiler4: 3000 }, 2),
      source("2026-09-05", { steam_boiler3: 2000 }, 3),
      source("2026-09-07", { gas_boiler3: 2100, steam_boiler3: 2100, gas_boiler4: 4100, steam_boiler4: 4100, cw_makeup: 700 }),
    ];
    const result = calculateDerivedProjections("2026-09-07", rows);
    expect(result.form5.values.boiler3_steam_used).toBe(100);
    expect(result.form5.values.boiler4_gas_used).toBe(1100);
    expect(result.form5.sourceRefs).toEqual(expect.arrayContaining([
      { aggregateId: "form8-2026-09-05", revisionId: "form8-2026-09-05@r3", revision: 3, plantDate: "2026-09-05" },
      { aggregateId: "form8-2026-09-04", revisionId: "form8-2026-09-04@r2", revision: 2, plantDate: "2026-09-04" },
      { aggregateId: "form8-2026-09-07", revisionId: "form8-2026-09-07@r1", revision: 1, plantDate: "2026-09-07" },
    ]));
  });
});
