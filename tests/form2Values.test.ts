import { describe, expect, it } from "vitest";
import { form2DisplayValues, upgradeForm2WorkingValues } from "../src/lib/form2Values";

describe("Form 2 value compatibility", () => {
  it("upgrades a legacy draft without losing final P/M values", () => {
    const result = upgradeForm2WorkingValues(3, { p_alk: 500, m_alk: 600, p_alk_burette: 1, m_alk_burette: 2, oh_alk: 999 });
    expect(result).toEqual({ formVersion: 4, upgraded: true, values: { p_alk: 500, m_alk: 600, oh_alk: 400 } });
  });

  it("reconstructs missing legacy final values from burette readings", () => {
    const result = upgradeForm2WorkingValues(3, { p_alk_burette: 25, m_alk_burette: 30 });
    expect(result.values).toEqual({ p_alk: 500, m_alk: 600, oh_alk: 400 });
  });

  it("provides display-only compatibility without mutating the source object", () => {
    const source = { p_alk_burette: 25, m_alk_burette: 30, oh_alk: 999 };
    expect(form2DisplayValues(source)).toEqual({ p_alk: 500, m_alk: 600, oh_alk: 400 });
    expect(source).toHaveProperty("p_alk_burette");
  });
});
