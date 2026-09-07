import { canonicalRecordId } from "../../shared/canonical";
import { form2DailyTotalsSourceDate, form2DailyTotalValues } from "../../shared/form2DailyTotals";
import { calculateForm5And6 } from "../../shared/formulas";
import { nextCalendarDate } from "../../shared/safetyContract";
import type { ContextInput, Values } from "../../shared/types";
import { getPublicRecord, getRecord } from "./api";
import { getDeviceToken } from "./device";
import { listLocalEntries } from "./offlineDb";

export type Form2DailyTotals = { sourceDate: string | null; status: "hidden" | "waiting" | "ready"; values: Values };

function waiting(sourceDate: string): Form2DailyTotals {
  return { sourceDate, status: "waiting", values: form2DailyTotalValues({}) };
}

export async function resolveForm2DailyTotals(context: ContextInput): Promise<Form2DailyTotals> {
  const sourceDate = form2DailyTotalsSourceDate(context);
  if (!sourceDate) return { sourceDate: null, status: "hidden", values: {} };

  const previousDate = nextCalendarDate(sourceDate, -1);
  const local = await listLocalEntries("integrator-readings");
  const current = local.find(entry => entry.status === "completed" && !entry.temporaryEdit && entry.context.date === sourceDate);
  const previous = local.find(entry => entry.status === "completed" && !entry.temporaryEdit && entry.context.date === previousDate);
  // Form 5 always requires the exact prior calendar date; defer to the shared formula for its status.
  const calculated = calculateForm5And6({ currentValues: current?.values ?? {}, previousValues: previous?.values ?? {}, currentDate: sourceDate, previousDate: previousDate, hasCurrent: Boolean(current), hasPrevious: Boolean(previous) });
  if (calculated.status === "current") return { sourceDate, status: "ready", values: form2DailyTotalValues(calculated.form5) };

  if (navigator.onLine) {
    try {
      const id = canonicalRecordId("daily-consumption-totals", sourceDate);
      const record = getDeviceToken() ? (await getRecord(id)).current : (await getPublicRecord(id)).record;
      if ((record.provenance as { status?: string } | null)?.status === "current") return { sourceDate, status: "ready", values: form2DailyTotalValues(record.values) };
    } catch {
      // A missing or unavailable projection remains a waiting display, never a form error.
    }
  }
  return waiting(sourceDate);
}
