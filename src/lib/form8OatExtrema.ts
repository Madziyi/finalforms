import { allFields, getForm } from "../../shared/forms";
import { deriveForm8OatExtrema, FORM8_OAT_EXTREME_KEYS, type Form8OatExtrema } from "../../shared/form8Oat";
import type { CanonicalRecord, ContextInput, Values } from "../../shared/types";
import { listPublicRecords, listRecords } from "./api";
import { getDeviceToken } from "./device";
import { listLocalEntries } from "./offlineDb";

export { FORM8_OAT_EXTREME_KEYS, type Form8OatExtrema } from "../../shared/form8Oat";

const FORM8_KEY = "integrator-readings";
const FORM9_KEY = "gas-turbine-log-sheet";

function oatFieldKey(): string {
  const field = allFields(getForm(FORM9_KEY)! as NonNullable<ReturnType<typeof getForm>>)
    .find(candidate => candidate.label === "O.A.T. Memorial");
  if (!field) throw new Error("Form 9 OAT field is missing from the schema.");
  return field.key;
}

export async function resolveForm8OatExtrema(context: ContextInput): Promise<Form8OatExtrema> {
  const sourceDate = context.date;
  const fieldKey = oatFieldKey();
  const local = await listLocalEntries(FORM9_KEY);
  const bySlot = new Map<string, { date: string; timeSlot: string; values: Values; status: string; lifecycle: string }>();
  for (const entry of local) {
    if (entry.status !== "completed" || entry.temporaryEdit || entry.context.date !== sourceDate || !entry.context.timeSlot) continue;
    bySlot.set(entry.context.timeSlot, { date: sourceDate, timeSlot: entry.context.timeSlot, values: entry.values, status: "completed", lifecycle: "completed" });
  }
  if (navigator.onLine) {
    try {
      const remote = getDeviceToken() ? await listRecords(FORM9_KEY, sourceDate) : await listPublicRecords(FORM9_KEY, sourceDate);
      for (const record of remote.records as CanonicalRecord[]) {
        if (record.lifecycle !== "completed" || record.date !== sourceDate || !record.timeSlot || bySlot.has(record.timeSlot)) continue;
        bySlot.set(record.timeSlot, { date: record.date, timeSlot: record.timeSlot, values: record.values, status: "completed", lifecycle: "completed" });
      }
    } catch {
      // A local result remains usable when the cloud lookup is unavailable.
    }
  }
  return deriveForm8OatExtrema([...bySlot.values()], sourceDate, fieldKey);
}
