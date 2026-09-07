import { allFields, getForm } from "../../shared/forms";
import { deriveForm8OatExtrema, FORM8_OAT_EXTREME_KEYS, type Form8OatExtrema } from "../../shared/form8Oat";
import type { CanonicalRecord, ContextInput } from "../../shared/types";
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
  const localResult = deriveForm8OatExtrema(local.map(entry => ({ ...entry, date: entry.context.date, timeSlot: entry.context.timeSlot })), sourceDate, fieldKey);
  if (localResult.status === "ready") return localResult;

  try {
    const remote = getDeviceToken() ? await listRecords(FORM9_KEY, sourceDate) : await listPublicRecords(FORM9_KEY, sourceDate);
    const remoteResult = deriveForm8OatExtrema(remote.records as CanonicalRecord[], sourceDate, fieldKey);
    if (remoteResult.status === "ready") return remoteResult;
  } catch {
    // No cloud data or an unavailable connection leaves the derived fields blank.
  }
  return { status: "hidden", values: {} };
}
