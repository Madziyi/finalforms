import type { Values } from "./types";

export const DERIVED_FORMULA_VERSION = 2;

function number(values: Values, key: string): number | null {
  const value = values[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
function delta(current: number | null, previous: number | null, label: string, warnings: string[]) {
  if (current == null || previous == null) return null;
  const result = current - previous;
  if (result < 0) {
    warnings.push(`${label}: current cumulative reading is below the previous calendar-date reading.`);
  }
  return result;
}
function ratio(numerator: number | null, denominator: number | null) {
  return numerator == null || denominator == null || denominator <= 0 ? null : numerator / denominator;
}
function sumAvailable(values: Array<number | null>) {
  const numbers = values.filter((value): value is number => value != null);
  return numbers.length ? numbers.reduce((sum, value) => sum + value, 0) : null;
}

type DeltaResult = { value: number | null; state: "absent" | "complete" | "incomplete" };
export type PreviousMeasurement = { value: number; date: string };
type PreviousMeasurementMap = Partial<Record<"gas_boiler3" | "steam_boiler3" | "gas_boiler4" | "steam_boiler4", PreviousMeasurement>>;

function completeDelta(current: number | null, previous: PreviousMeasurement | null, label: string, currentDate: string, warnings: string[]): DeltaResult {
  if (current == null && previous == null) return { value: null, state: "absent" };
  if (current == null) {
    warnings.push(`${label}: current exact-date reading is missing on ${currentDate}.`);
    return { value: null, state: "incomplete" };
  }
  if (!previous) {
    warnings.push(`${label}: no previous measurement exists before ${currentDate}.`);
    return { value: null, state: "incomplete" };
  }
  const value = current - previous.value;
  if (value < 0) warnings.push(`${label}: current cumulative reading is below the previous measurement from ${previous.date}.`);
  return { value, state: "complete" };
}

export function calculateOhAlk(pAlk: unknown, mAlk: unknown): number | null {
  return typeof pAlk === "number" && Number.isFinite(pAlk) && typeof mAlk === "number" && Number.isFinite(mAlk)
    ? (pAlk * 2) - mAlk
    : null;
}

export function calculateForm5And6(input: {
  currentValues: Values;
  previousValues: Values;
  currentDate: string;
  previousDate: string;
  hasCurrent: boolean;
  hasPrevious: boolean;
  previousMeasurements?: PreviousMeasurementMap;
}) {
  const { currentValues, previousValues, currentDate, previousDate, hasCurrent, hasPrevious, previousMeasurements } = input;
  const warnings: string[] = [];
  const dependencyStatus: "current" | "waiting" = hasCurrent && hasPrevious ? "current" : "waiting";
  if (!hasCurrent) warnings.push(`Waiting for completed Form 8 on ${currentDate}.`);
  if (!hasPrevious) warnings.push(`Waiting for a completed previous Form 8 measurement before ${currentDate}.`);

  const fallbackPrevious = (key: keyof PreviousMeasurementMap): PreviousMeasurement | null => {
    const value = number(previousValues, key);
    return value == null ? null : { value, date: previousDate };
  };
  const b3Gas = completeDelta(number(currentValues,"gas_boiler3"), previousMeasurements?.gas_boiler3 ?? fallbackPrevious("gas_boiler3"), "Boiler 3 gas", currentDate, warnings);
  const b3Steam = completeDelta(number(currentValues,"steam_boiler3"), previousMeasurements?.steam_boiler3 ?? fallbackPrevious("steam_boiler3"), "Boiler 3 steam", currentDate, warnings);
  const b4Gas = completeDelta(number(currentValues,"gas_boiler4"), previousMeasurements?.gas_boiler4 ?? fallbackPrevious("gas_boiler4"), "Boiler 4 gas", currentDate, warnings);
  const b4Steam = completeDelta(number(currentValues,"steam_boiler4"), previousMeasurements?.steam_boiler4 ?? fallbackPrevious("steam_boiler4"), "Boiler 4 steam", currentDate, warnings);
  const makeup = delta(number(currentValues,"hotwell_makeup"), number(previousValues,"hotwell_makeup"), "Hotwell makeup", warnings);
  const b2Steam = number(currentValues,"steam_boiler2");
  const steamContributions = [b3Steam, b4Steam]
    .filter((boiler): boiler is DeltaResult & { state: "absent" | "complete" } => boiler.state !== "incomplete")
    .map((boiler) => boiler.value);
  const totalSteam = dependencyStatus === "current" ? sumAvailable([b2Steam, ...steamContributions]) : null;

  const form5: Values = {
    oat_high: number(currentValues,"oat_high"),
    oat_low: number(currentValues,"oat_low"),
    boiler2_gas_used: number(currentValues,"gas_boiler2"),
    boiler2_steam_used: b2Steam,
    boiler3_gas_used: dependencyStatus === "current" ? b3Gas.value : null,
    boiler3_steam_used: dependencyStatus === "current" ? b3Steam.value : null,
    boiler3_lbs_steam_per_cuft_gas: dependencyStatus === "current" ? ratio(b3Steam.value,b3Gas.value) : null,
    boiler4_gas_used: dependencyStatus === "current" ? b4Gas.value : null,
    boiler4_steam_used: dependencyStatus === "current" ? b4Steam.value : null,
    boiler4_lbs_steam_per_cuft_gas: dependencyStatus === "current" ? ratio(b4Steam.value,b4Gas.value) : null,
    total_steam: totalSteam,
    average_flow_hr: totalSteam == null ? null : totalSteam / 24,
    makeup_water_gallon: dependencyStatus === "current" ? makeup : null,
    makeup_percent: totalSteam == null || totalSteam === 0 || makeup == null ? null : (makeup / totalSteam) * 1000,
  };

  const cwDelta = delta(number(currentValues,"cw_makeup"), number(previousValues,"cw_makeup"), "C.W. Makeup", warnings);
  const form6: Values = {
    cw_makeup_current: number(currentValues,"cw_makeup"),
    cw_makeup_used: dependencyStatus === "current" ? cwDelta : null,
    tower_makeup_current: number(currentValues,"tower_makeup"),
  };
  return { status: dependencyStatus, form5, form6, warnings };
}
