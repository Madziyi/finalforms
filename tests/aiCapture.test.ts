import { describe, expect, it } from "vitest";
import { AI_FIELD_GUIDES, buildAiCapturePrompt, normalizeAiCaptureResponse } from "../worker/domain/aiCapture";

describe("gas-turbine AI capture contract",()=>{
  it("uses fixed DCS tag, description, unit, and column anchors",()=>{
    const prompt=buildAiCapturePrompt();
    expect(Object.keys(AI_FIELD_GUIDES)).toHaveLength(28);
    expect(prompt).toContain('tag "TE-68A"; description "Generator Stator Phase A"; unit "Deg F"; left detail column');
    expect(prompt).toContain('tag "FT-11"; description "Natural Fuel Gas Flow / Natural Gas Fuel Flow"; unit "SCFM"; right detail column');
    expect(prompt).toContain("Never infer, repair, normalize, or replace an abnormal-looking value.");
  });
  it("accepts numeric strings, rejects invalid values, and maps FT-11 aliases",()=>{
    const result=normalizeAiCaptureResponse({values:{generator_stator_phase_a:"71.5",steam_flow:"bad",unexpected:12},needsCheck:["natural_fuel_gas_flow","unexpected",42]});
    expect(result.values.generator_stator_phase_a).toBe(71.5);expect(result.values.steam_flow).toBeNull();expect(result.values.status_monitor_comp_fuel_flow).toBeNull();expect(result.needsCheck).toEqual(["status_monitor_comp_fuel_flow"]);
  });
});
