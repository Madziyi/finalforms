import { nextCalendarDate } from "./safetyContract";
import type { ContextInput, Values } from "./types";

export const FORM2_DAILY_TOTAL_KEYS = ["steam_total", "makeup_total"] as const;

/** Returns the Form 5 plant date whose totals belong on this Form 2 context. */
export function form2DailyTotalsSourceDate(context: ContextInput): string | null {
  if (context.shift === "Night") return context.date;
  if (context.shift === "Day") return nextCalendarDate(context.date, -1);
  return null;
}

export function form2DailyTotalValues(values: Values): Values {
  return {
    steam_total: values.total_steam ?? null,
    makeup_total: values.makeup_water_gallon ?? null,
  };
}
