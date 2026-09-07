import { deriveForm8OatExtrema, type OatSourceRecord } from "../../shared/form8Oat";
import { nextCalendarDate } from "../../shared/safetyContract";
import type { Values } from "../../shared/types";

export type ExportProjectionSource = {
  plantDate: string;
  status: string;
  values: Values;
};

export type ExportMaterializationSources = {
  form9Oat: readonly OatSourceRecord[];
  form5Projections: readonly ExportProjectionSource[];
};

export function form2TotalsSourceDate(date: string, shift: string | null | undefined): string | null {
  if (shift === "Night") return date;
  if (shift === "Day") return nextCalendarDate(date, -1);
  return null;
}

/**
 * Adds values that are intentionally display-only in the operator forms to an
 * export row. The returned values are an export snapshot only; callers must
 * not write them back to canonical_records or derived_projections.
 */
export function materializeExportValues(
  formKey: string,
  date: string,
  shift: string | null | undefined,
  storedValues: Values,
  sources: ExportMaterializationSources,
): Values {
  const values: Values = { ...storedValues };

  if (formKey === "integrator-readings") {
    const extrema = deriveForm8OatExtrema(sources.form9Oat, date, "oat_memorial");
    values.oat_high = extrema.status === "ready" ? extrema.values.oat_high ?? null : null;
    values.oat_low = extrema.status === "ready" ? extrema.values.oat_low ?? null : null;
  }

  if (formKey === "boiler-water-control-tests") {
    values.steam_total = null;
    values.makeup_total = null;
    const sourceDate = form2TotalsSourceDate(date, shift);
    const projection = sourceDate
      ? sources.form5Projections.find((candidate) => candidate.plantDate === sourceDate && candidate.status === "current")
      : undefined;
    if (projection) {
      values.steam_total = projection.values.total_steam ?? null;
      values.makeup_total = projection.values.makeup_water_gallon ?? null;
    }
  }

  return values;
}
