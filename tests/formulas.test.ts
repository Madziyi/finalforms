import { describe, expect, it } from "vitest";
import { calculateForm5And6, calculateOhAlk } from "../shared/formulas";

describe("server formulas", () => {
  it("calculates OH-ALK deterministically and preserves blank", () => {
    expect(calculateOhAlk(500, 600)).toBe(400);
    expect(calculateOhAlk(null, 600)).toBeNull();
  });

  it("uses exact current/previous Form 8 values", () => {
    const result = calculateForm5And6({
      currentDate: "2026-09-03",
      previousDate: "2026-09-02",
      hasCurrent: true,
      hasPrevious: true,
      currentValues: {
        oat_high: 88, oat_low: 61,
        gas_boiler2: 100, steam_boiler2: 200,
        gas_boiler3: 1500, steam_boiler3: 3000,
        gas_boiler4: 2500, steam_boiler4: 5000,
        hotwell_makeup: 12000, cw_makeup: 8000, tower_makeup: 9000,
      },
      previousValues: {
        gas_boiler3: 1400, steam_boiler3: 2800,
        gas_boiler4: 2400, steam_boiler4: 4800,
        hotwell_makeup: 11800, cw_makeup: 7900,
      },
    });
    expect(result.status).toBe("current");
    expect(result.form5.boiler2_gas_used).toBe(100);
    expect(result.form5.boiler3_gas_used).toBe(100);
    expect(result.form5.boiler3_steam_used).toBe(200);
    expect(result.form5.boiler3_lbs_steam_per_cuft_gas).toBe(2);
    expect(result.form5.boiler4_gas_used).toBe(100);
    expect(result.form5.boiler4_steam_used).toBe(200);
    expect(result.form5.total_steam).toBe(600);
    expect(result.form5.average_flow_hr).toBe(25);
    expect(result.form5.makeup_water_gallon).toBe(200);
    expect(result.form5.makeup_percent).toBeCloseTo(333.3333333333);
    expect(result.form6.cw_makeup_current).toBe(8000);
    expect(result.form6.cw_makeup_used).toBe(100);
    expect(result.form6.tower_makeup_current).toBe(9000);
  });

  it("waits when there is no previous measurement", () => {
    const result = calculateForm5And6({
      currentDate: "2026-09-03",
      previousDate: "2026-09-02",
      hasCurrent: true,
      hasPrevious: false,
      currentValues: { gas_boiler3: 1500, cw_makeup: 8000, tower_makeup: 9000 },
      previousValues: {},
    });
    expect(result.status).toBe("waiting");
    expect(result.form5.boiler3_gas_used).toBeNull();
    expect(result.form6.cw_makeup_used).toBeNull();
    expect(result.warnings.join(" ")).toContain("previous Form 8 measurement before 2026-09-03");
  });

  it("retains negative cumulative deltas and adds a warning", () => {
    const result = calculateForm5And6({
      currentDate: "2026-09-03", previousDate: "2026-09-02", hasCurrent: true, hasPrevious: true,
      currentValues: { gas_boiler3: 90, steam_boiler3: 90, hotwell_makeup: 90, cw_makeup: 90 },
      previousValues: { gas_boiler3: 100, steam_boiler3: 100, hotwell_makeup: 100, cw_makeup: 100 },
    });
    expect(result.form5.boiler3_gas_used).toBe(-10);
    expect(result.form5.makeup_water_gallon).toBe(-10);
    expect(result.form6.cw_makeup_used).toBe(-10);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it("does not suppress available steam when Boiler 4 has an incomplete pair", () => {
    const result = calculateForm5And6({
      currentDate: "2026-09-07", previousDate: "2026-09-06", hasCurrent: true, hasPrevious: true,
      currentValues: { steam_boiler2: 1000, steam_boiler4: 368519000, hotwell_makeup: 12000 },
      previousValues: { steam_boiler4: null, hotwell_makeup: 11000 },
    });
    expect(result.form5.boiler4_steam_used).toBeNull();
    expect(result.form5.total_steam).toBe(1000);
    expect(result.form5.average_flow_hr).toBe(1000 / 24);
    expect(result.form5.makeup_percent).toBe(1000);
    expect(result.form5.makeup_water_gallon).toBe(1000);
    expect(result.warnings).toContain("Boiler 4 steam: no previous measurement exists before 2026-09-07.");
  });

  it("allows total steam to use only Boiler 2 when optional boilers are absent", () => {
    const result = calculateForm5And6({
      currentDate: "2026-09-07", previousDate: "2026-09-06", hasCurrent: true, hasPrevious: true,
      currentValues: { steam_boiler2: 1000, steam_boiler3: null, steam_boiler4: null },
      previousValues: { steam_boiler3: null, steam_boiler4: null },
    });
    expect(result.form5.total_steam).toBe(1000);
    expect(result.warnings).toEqual([]);
  });

  it("treats Boiler 3/4 blank on both exact dates as absent, but preserves a negative complete delta", () => {
    const result = calculateForm5And6({
      currentDate: "2026-09-07", previousDate: "2026-09-06", hasCurrent: true, hasPrevious: true,
      currentValues: { steam_boiler2: 1000, steam_boiler3: 90, steam_boiler4: null },
      previousValues: { steam_boiler3: 100, steam_boiler4: null },
    });
    expect(result.form5.boiler4_steam_used).toBeNull();
    expect(result.form5.boiler3_steam_used).toBe(-10);
    expect(result.form5.total_steam).toBe(990);
    expect(result.warnings.some(warning => warning.includes("Boiler 3 steam"))).toBe(true);
  });
});
