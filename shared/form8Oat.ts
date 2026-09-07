import type { Values } from "./types";

export const FORM8_OAT_EXTREME_KEYS = ["oat_high", "oat_low"] as const;

export type Form8OatExtrema = { sourceDate?: string | null; status: "hidden" | "ready"; values: Values };

export type OatSourceRecord = {
  date: string;
  timeSlot?: string | null;
  values: Values;
  status?: string;
  lifecycle?: string;
  temporaryEdit?: boolean;
};

export function deriveForm8OatExtrema(records: readonly OatSourceRecord[], sourceDate: string, fieldKey: string): Form8OatExtrema {
  const slots = new Set<string>();
  const readings: number[] = [];
  for (const record of records) {
    if (record.date !== sourceDate || record.temporaryEdit) continue;
    if (record.status !== undefined && record.status !== "completed") continue;
    if (record.lifecycle !== undefined && record.lifecycle !== "completed") continue;
    const value = record.values[fieldKey];
    if (typeof value !== "number" || !Number.isFinite(value)) continue;
    const slot = record.timeSlot ?? "";
    if (slots.has(slot)) continue;
    slots.add(slot);
    readings.push(value);
  }
  if (!readings.length) return { status: "hidden", values: {} };
  return { status: "ready", values: { oat_high: Math.max(...readings), oat_low: Math.min(...readings) } };
}
