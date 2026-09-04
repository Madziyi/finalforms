import { describe, expect, it } from "vitest";
import { normalizeContext, nextCalendarDate } from "../shared/safetyContract";
import { calculateForm5And6, calculateOhAlk } from "../shared/formulas";

const form8Current = {
  oat_high: 29,
  oat_low: 18,
  steam_boiler2: 1000,
  steam_boiler3: 5000,
  steam_boiler4: 8000,
  gas_boiler2: 50,
  gas_boiler3: 300,
  gas_boiler4: 600,
  hotwell_makeup: 12000,
  cw_makeup: 10000,
  tower_makeup: 7000,
};
const form8Previous = {
  steam_boiler3: 4500,
  steam_boiler4: 7400,
  gas_boiler3: 250,
  gas_boiler4: 500,
  hotwell_makeup: 11500,
  cw_makeup: 9700,
};

describe("context ownership contract", () => {
  it("normalizes Boiler Water by date, shift, and Boiler 2/3/4", () => {
    expect(normalizeContext("boiler-water-control-tests", { date:"2026-09-03", shift:"Day", boilerNumber:2 })).toBe("2026-09-03|shift=Day|boiler=2");
    expect(() => normalizeContext("boiler-water-control-tests", { date:"2026-09-03", shift:"Day", boilerNumber:5 as never })).toThrow();
  });
  it("normalizes time-slot forms by exact two-hour slot", () => {
    expect(normalizeContext("yst-yk-chiller", { date:"2026-09-03", timeSlot:"08:00" })).toBe("2026-09-03|time=08:00");
    expect(() => normalizeContext("yst-yk-chiller", { date:"2026-09-03", timeSlot:"09:00" })).toThrow();
  });
  it("uses calendar dates rather than 24-hour arithmetic", () => {
    expect(nextCalendarDate("2026-03-08", -1)).toBe("2026-03-07");
    expect(nextCalendarDate("2026-12-31", 1)).toBe("2027-01-01");
  });
});

describe("deterministic derived formulas", () => {
  it("recomputes Form 2 OH-ALK from accepted P-ALK and M-ALK", () => {
    expect(calculateOhAlk(450, 600)).toBe(300);
    expect(calculateOhAlk(null, 600)).toBeNull();
  });
  it("calculates Form 5 and three-field Form 6 only from exact current/previous dates", () => {
    const result = calculateForm5And6({ currentValues:form8Current, previousValues:form8Previous, currentDate:"2026-09-03", previousDate:"2026-09-02", hasCurrent:true, hasPrevious:true });
    expect(result.status).toBe("current");
    expect(result.form5.boiler3_gas_used).toBe(50);
    expect(result.form5.boiler3_steam_used).toBe(500);
    expect(result.form5.boiler3_lbs_steam_per_cuft_gas).toBe(10);
    expect(result.form5.boiler4_gas_used).toBe(100);
    expect(result.form5.boiler4_steam_used).toBe(600);
    expect(result.form5.total_steam).toBe(2100);
    expect(result.form5.average_flow_hr).toBe(87.5);
    expect(result.form5.makeup_water_gallon).toBe(500);
    expect(result.form6.cw_makeup_current).toBe(10000);
    expect(result.form6.cw_makeup_used).toBe(300);
    expect(result.form6.tower_makeup_current).toBe(7000);
  });
  it("never substitutes a missing previous calendar date", () => {
    const result = calculateForm5And6({ currentValues:form8Current, previousValues:{}, currentDate:"2026-09-03", previousDate:"2026-09-02", hasCurrent:true, hasPrevious:false });
    expect(result.status).toBe("waiting");
    expect(result.form5.boiler3_gas_used).toBeNull();
    expect(result.form5.total_steam).toBeNull();
    expect(result.form6.cw_makeup_used).toBeNull();
    expect(result.warnings.join(" ")).toContain("2026-09-02");
  });
  it("retains decreasing cumulative meters with a warning", () => {
    const result = calculateForm5And6({ currentValues:{...form8Current,gas_boiler3:200}, previousValues:form8Previous, currentDate:"2026-09-03", previousDate:"2026-09-02", hasCurrent:true, hasPrevious:true });
    expect(result.form5.boiler3_gas_used).toBe(-50);
    expect(result.form5.boiler3_lbs_steam_per_cuft_gas).toBeNull();
    expect(result.warnings.some((warning) => warning.includes("Boiler 3 gas"))).toBe(true);
  });
});
