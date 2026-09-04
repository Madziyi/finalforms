import { getForm } from "./forms";
import type { ContextInput } from "./types";

// v1 command/revision endpoints remain available for migration and old data,
// but the active tablet protocol is the local-first completed-record upload.
export const PROTOCOL_VERSION = 2;
export const APP_SCHEMA_VERSION = 2;
export const BOILER_VALUES = [2, 3, 4] as const;
export const TIME_SLOTS = Array.from({ length: 12 }, (_, i) => `${String(i * 2).padStart(2, "0")}:00`);

export function isIsoDate(value: string) { return /^\d{4}-\d{2}-\d{2}$/.test(value); }
export function normalizeContext(formKey: string, input: ContextInput): string {
  const form = getForm(formKey);
  if (!form) throw new Error(`Unknown form: ${formKey}`);
  if (!isIsoDate(input.date)) throw new Error("A valid plant date is required.");
  const parts = [input.date];
  if (form.hasShift) {
    if (input.shift !== "Day" && input.shift !== "Night") throw new Error("Day or Night shift is required.");
    parts.push(`shift=${input.shift}`);
  }
  if (form.hasTimeSlot) {
    if (!input.timeSlot || !TIME_SLOTS.includes(input.timeSlot)) throw new Error("A valid two-hour time slot is required.");
    parts.push(`time=${input.timeSlot}`);
  }
  if (form.hasBoiler) {
    if (!BOILER_VALUES.includes(input.boilerNumber as 2 | 3 | 4)) throw new Error("Boiler must be 2, 3, or 4.");
    parts.push(`boiler=${input.boilerNumber}`);
  }
  return parts.join("|");
}

export function nextCalendarDate(date: string, delta: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + delta));
  return dt.toISOString().slice(0, 10);
}
