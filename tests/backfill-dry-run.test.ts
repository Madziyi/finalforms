import { describe, expect, it } from "vitest";
import { transformLegacyRows } from "../scripts/backfill-dry-run";
import { classifyExistingApply } from "../scripts/backfill-apply";

function row(overrides: Record<string, unknown> = {}) {
  return {
    aggregate_id: "legacy-1",
    form_key: "ecc-cooling-tower-water-control-tests",
    form_version: 1,
    context_key: "2026-09-07|shift=Day",
    operator_id: "operator-marj",
    operator_name: "Marj",
    plant_date: "2026-09-07",
    shift: "Day",
    time_slot: null,
    boiler_number: null,
    values_json: JSON.stringify({ conductivity: "1150", molybdenum: 100, pump_sp_st: "12 / 34", retired_fuel_pressure: 5 }),
    local_revision: 4,
    created_at: "2026-09-07T11:59:00.000Z",
    updated_at: "2026-09-07 12:00:00",
    client_updated_at: "2026-09-07T12:00:00.000Z",
    ...overrides,
  };
}

describe("legacy canonical backfill dry-run transformation", () => {
  it("maps Form 1 legacy fields and reports unknown/retired fields", () => {
    const result = transformLegacyRows([row()]);
    const candidate = result.candidates[0];
    expect(candidate.canonical_id).toBe("F01-2026-09-07-2");
    expect(candidate.values).toMatchObject({ conductivity: 1150, ptsa: 100, pump_sp_st: { first: 12, second: 34 } });
    expect(candidate.values).not.toHaveProperty("retired_fuel_pressure");
    expect(candidate.disposition).toBe("ready_with_warnings");
    expect(result.anomalies.map((anomaly) => anomaly.kind)).toContain("unknown_field");
  });

  it("reconstructs Form 2 direct P/M/OH values and drops legacy derived totals", () => {
    const result = transformLegacyRows([row({
      aggregate_id: "legacy-form2",
      form_key: "boiler-water-control-tests",
      context_key: "2026-09-07|shift=Night|boiler=3",
      shift: "Night",
      boiler_number: 3,
      values_json: JSON.stringify({ p_alk: "500", m_alk: 600, oh_alk: 999, steam_total: 44, makeup_total: 12, blr_cond: 3900 }),
    })]);
    const candidate = result.candidates[0];
    expect(candidate.canonical_id).toBe("F02-2026-09-07-1-3");
    expect(candidate.values).toMatchObject({ p_alk: 500, m_alk: 600, oh_alk: 400, blr_cond: 3900 });
    expect(candidate.values).not.toHaveProperty("p_alk_burette");
    expect(candidate.values).not.toHaveProperty("m_alk_burette");
    expect(candidate.values).not.toHaveProperty("steam_total");
    expect(candidate.values).not.toHaveProperty("makeup_total");
    expect(result.anomalies.filter((anomaly) => anomaly.disposition === "accepted")).toHaveLength(3);
  });

  it("flags missing/non-numeric Form 2 P/M inputs", () => {
    const result = transformLegacyRows([row({
      form_key: "boiler-water-control-tests",
      context_key: "2026-09-07|shift=Day|boiler=2",
      boiler_number: 2,
      values_json: JSON.stringify({ p_alk: "not-a-number", m_alk: null }),
    })]);
    expect(result.candidates[0].disposition).toBe("ready_with_warnings");
    expect(result.anomalies.filter((anomaly) => anomaly.kind === "conversion").map((anomaly) => anomaly.field)).toEqual(["p_alk", "m_alk"]);
    expect(result.candidates[0].values.oh_alk).toBeNull();
  });

  it("keeps Form 8 OAT extrema out of operational values", () => {
    const result = transformLegacyRows([row({
      form_key: "integrator-readings",
      context_key: "2026-09-07",
      shift: null,
      values_json: JSON.stringify({ oat_high: 90, oat_low: 50, gas_boiler2: 10 }),
    })]);
    expect(result.candidates[0].values).toEqual({ gas_boiler2: 10 });
    expect(result.anomalies.filter((anomaly) => anomaly.disposition === "accepted").map((anomaly) => anomaly.field)).toEqual(["oat_high", "oat_low"]);
  });

  it("preserves historical two-hour slots and marks target context collisions", () => {
    const source = row({
      aggregate_id: "legacy-form3",
      form_key: "yst-yk-chiller",
      context_key: "2026-09-07|time=10:00",
      shift: "Day",
      time_slot: "10:00",
      values_json: JSON.stringify({ hour_meter: 12 }),
    });
    const result = transformLegacyRows([source], [{ canonical_id: "F03-2026-09-07-1100", form_key: "yst-yk-chiller", context_key: "2026-09-07|time=11:00" }]);
    expect(result.candidates[0]).toMatchObject({ canonical_id: "F03-2026-09-07-1100", context_key: "2026-09-07|time=11:00", shift: "Day", time_slot: "11:00", disposition: "collision" });
    expect(result.anomalies.some((anomaly) => anomaly.kind === "accepted_slot_mapping")).toBe(true);
  });

  it("excludes old derived Forms 5/6 rather than importing projections", () => {
    const result = transformLegacyRows([row({ form_key: "daily-consumption-totals", values_json: JSON.stringify({ total_steam: 1 }) })]);
    expect(result.candidates).toHaveLength(0);
    expect(result.excludedRows).toBe(1);
    expect(result.anomalies[0].kind).toBe("excluded_form");
  });

  it("forces the approved formerly-unparseable Pump Sp/St candidate and records an audit note", () => {
    const result = transformLegacyRows([row({
      aggregate_id: "c8911f6a-db6a-45da-a451-67a2ba4d4d87",
      shift: "Night",
      context_key: "2026-09-07|shift=Night",
      values_json: JSON.stringify({ conductivity: 1100, pump_sp_st: null }),
    })]);
    expect(result.candidates[0].values.pump_sp_st).toEqual({ first: 75, second: 60 });
    expect(result.candidates[0].disposition).toBe("ready");
    expect(result.anomalies.some((anomaly) => anomaly.disposition === "accepted" && anomaly.kind === "approved_forced_transform")).toBe(true);
  });

  it("treats a matching audit marker as idempotently already applied", () => {
    expect(classifyExistingApply(JSON.stringify({ manifest_hash: "abc" }), "abc")).toBe("already-applied");
    expect(classifyExistingApply(null, "abc")).toBe("ready");
    expect(() => classifyExistingApply(JSON.stringify({ manifest_hash: "other" }), "abc")).toThrow();
  });
});
