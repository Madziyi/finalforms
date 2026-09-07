import { form2DailyTotalsSourceDate, form2DailyTotalValues } from "../../shared/form2DailyTotals";
import type { ContextInput, Values } from "../../shared/types";
import { resolveDerivedProjection } from "./derivedProjections";

export type Form2DailyTotals = { sourceDate: string | null; status: "hidden" | "waiting" | "ready"; values: Values };

function waiting(sourceDate: string): Form2DailyTotals {
  return { sourceDate, status: "waiting", values: form2DailyTotalValues({}) };
}

export async function resolveForm2DailyTotals(context: ContextInput): Promise<Form2DailyTotals> {
  const sourceDate = form2DailyTotalsSourceDate(context);
  if (!sourceDate) return { sourceDate: null, status: "hidden", values: {} };
  try {
    const resolved = await resolveDerivedProjection("daily-consumption-totals", sourceDate);
    if (resolved.record && resolved.status === "current") return { sourceDate, status: "ready", values: form2DailyTotalValues(resolved.record.values) };
    return waiting(sourceDate);
  } catch {
    // A missing or unavailable projection remains a waiting display, never a form error.
    return waiting(sourceDate);
  }
}
