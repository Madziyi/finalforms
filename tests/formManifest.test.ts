import { describe, expect, it } from "vitest";
import { FORMS, allFields } from "../shared/forms";

const expectedSheets = ["01 Cooling Tower","02 Boiler Water","03 YST-YK Chiller","04 York Chiller","05 Daily Consumption","06 Makeup","07 Pretreatment","08 Integrator","09 Gas Turbine"];

describe("backup/form manifest", () => {
  it("contains exactly nine stable form and worksheet identities", () => {
    expect(FORMS).toHaveLength(9);
    expect(FORMS.map((form) => form.number)).toEqual([1,2,3,4,5,6,7,8,9]);
    expect(FORMS.map((form) => form.backupWorksheetName)).toEqual(expectedSheets);
    expect(new Set(FORMS.map((form) => form.key)).size).toBe(9);
    expect(new Set(FORMS.map((form) => form.backupWorksheetName)).size).toBe(9);
  });
  it("defines Form 6 as the three approved server-derived fields", () => {
    const form6 = FORMS.find((form) => form.number === 6)!;
    expect(form6.schedule).toBe("derived");
    expect(allFields(form6).map((field) => field.key)).toEqual(["cw_makeup_current","cw_makeup_used","tower_makeup_current"]);
  });
  it("defines direct P/M entry and calculated OH-ALK for the current Form 2 contract", () => {
    const form2 = FORMS.find((form) => form.number === 2)!;
    expect(form2.version).toBe(4);
    expect(allFields(form2).map((field) => field.key)).not.toEqual(expect.arrayContaining(["p_alk_burette", "m_alk_burette"]));
    expect(allFields(form2).find((field) => field.key === "p_alk")?.calculated).not.toBe(true);
    expect(allFields(form2).find((field) => field.key === "m_alk")?.calculated).not.toBe(true);
    const oh = allFields(form2).find((field) => field.key === "oh_alk")!;
    expect(oh.calculated).toBe(true);
  });
});
