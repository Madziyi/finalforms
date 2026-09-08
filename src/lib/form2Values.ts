import { calculateOhAlk } from "../../shared/formulas";
import type { Values } from "../../shared/types";

export const FORM2_CURRENT_VERSION = 4;
export const FORM2_LEGACY_VERSION = 3;

function finite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Converts a legacy Form 2 working snapshot into the current direct P/M shape.
 * The returned object is a new working copy; callers decide whether it is safe
 * to persist (draft upgrade) or should remain temporary (replacement/display).
 */
export function upgradeForm2WorkingValues(formVersion: number, values: Values) {
  if (formVersion !== FORM2_LEGACY_VERSION) return { formVersion, values: structuredClone(values), upgraded: false };
  const next = structuredClone(values);
  const pAlk = finite(next.p_alk) ?? (finite(next.p_alk_burette) == null ? null : finite(next.p_alk_burette)! * 20);
  const mAlk = finite(next.m_alk) ?? (finite(next.m_alk_burette) == null ? null : finite(next.m_alk_burette)! * 20);
  next.p_alk = pAlk;
  next.m_alk = mAlk;
  next.oh_alk = calculateOhAlk(pAlk, mAlk);
  delete next.p_alk_burette;
  delete next.m_alk_burette;
  return { formVersion: FORM2_CURRENT_VERSION, values: next, upgraded: true };
}

/** Display-only compatibility for old cloud/completed records. */
export function form2DisplayValues(values: Values) {
  return upgradeForm2WorkingValues(FORM2_LEGACY_VERSION, values).values;
}
