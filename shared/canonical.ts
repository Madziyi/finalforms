/**
 * Canonical record IDs are globally unique at the application boundary.
 *
 * The form key is deliberately part of the ID rather than being inferred
 * from a route or a table. This makes an ID safe to move between queues,
 * exports, caches, and forms without losing its identity namespace.
 */
import { getForm } from "./forms";
import type { ContextInput } from "./types";

export const CANONICAL_ID_SEPARATOR = "-";

/** A stable, globally namespaced operational identity; it never uses a UUID or client clock. */
export function canonicalRecordId(formKey: string, context: ContextInput | string): string {
  const form = getForm(formKey);
  if (!form) throw new Error(`Unknown form: ${formKey}`);
  const input = typeof context === "string" ? { date: context } : context;
  const date = input.date;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Canonical IDs require an ISO plant date.");
  const parts = [`F${String(form.number).padStart(2, "0")}`, date];
  if (form.hasTimeSlot) {
    if (!input.timeSlot || !/^\d{2}:\d{2}$/.test(input.timeSlot)) throw new Error("Canonical IDs require a time slot.");
    parts.push(input.timeSlot.replace(":", ""));
  }
  if (form.hasShift) {
    if (input.shift !== "Day" && input.shift !== "Night" && input.shift !== "Extra") throw new Error("Canonical IDs require a shift.");
    parts.push(input.shift === "Night" ? "1" : input.shift === "Day" ? "2" : "3");
  }
  if (form.hasBoiler) {
    if (!input.boilerNumber) throw new Error("Canonical IDs require a boiler.");
    parts.push(String(input.boilerNumber));
  }
  return parts.join(CANONICAL_ID_SEPARATOR);
}

export function isCanonicalRecordId(formKey: string, id: unknown): id is string {
  const form = getForm(formKey);
  return typeof id === "string" && Boolean(form) && id.startsWith(`F${String(form!.number).padStart(2, "0")}-`);
}
