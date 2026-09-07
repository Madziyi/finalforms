import { getForm } from "./forms";
import type { ContextInput, Shift } from "./types";

// v1 command/revision endpoints remain available for migration and old data,
// but the active tablet protocol is the local-first completed-record upload.
export const PROTOCOL_VERSION = 3;
export const APP_SCHEMA_VERSION = 3;
export const BOILER_VALUES = [2, 3, 4] as const;
/** Display order deliberately keeps the rarely-used Extra shift last. */
export const SHIFT_OPTIONS = ["Day", "Night", "Extra"] as const satisfies readonly Shift[];
/** Four-hour operator rounds for Forms 3, 4, and 9. */
export const TIME_SLOTS = ["03:00", "07:00", "11:00", "15:00", "19:00", "23:00"] as const;

export function isIsoDate(value: string) { return /^\d{4}-\d{2}-\d{2}$/.test(value); }
export function normalizeContext(formKey: string, input: ContextInput): string {
  const form = getForm(formKey);
  if (!form) throw new Error(`Unknown form: ${formKey}`);
  if (!isIsoDate(input.date)) throw new Error("A valid plant date is required.");
  const parts = [input.date];
  if (form.hasShift) {
    if (!SHIFT_OPTIONS.includes(input.shift as Shift)) throw new Error("Day, Night, or Extra shift is required.");
    parts.push(`shift=${input.shift}`);
  }
  if (form.hasTimeSlot) {
    if (!input.timeSlot || !TIME_SLOTS.includes(input.timeSlot as typeof TIME_SLOTS[number])) throw new Error("A valid four-hour time slot is required.");
    parts.push(`time=${input.timeSlot}`);
  }
  if (form.hasBoiler) {
    if (!BOILER_VALUES.includes(input.boilerNumber as 2 | 3 | 4)) throw new Error("Boiler must be 2, 3, or 4.");
    parts.push(`boiler=${input.boilerNumber}`);
  }
  return parts.join("|");
}

/** Stable synthetic times order Extra → Day → Night within one plant date. */
export function shiftMeasuredAt(date: string, shift: Shift | null | undefined): string {
  const time = shift === "Extra" ? "06:00:00" : shift === "Day" ? "12:00:00" : "23:59:00";
  return `${date}T${time}`;
}

export function nextCalendarDate(date: string, delta: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + delta));
  return dt.toISOString().slice(0, 10);
}
