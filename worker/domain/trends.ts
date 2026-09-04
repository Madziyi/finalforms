import { allFields, getForm } from "../../shared/forms";
import type { Values } from "../../shared/types";

export function derivedNumericStatements(
  db: D1Database,
  input: { projectionId: string; projectionRevision: number; formKey: "daily-consumption-totals" | "makeup"; plantDate: string; values: Values },
) {
  const form = getForm(input.formKey)!;
  const trendable = new Set(allFields(form).filter((field) => field.trendable).map((field) => field.key));
  const statements: D1PreparedStatement[] = [
    db.prepare(`UPDATE derived_numeric_observations SET is_current=0 WHERE projection_id=?`).bind(input.projectionId),
  ];
  const measuredAt = `${input.plantDate}T23:59:00`;
  for (const [fieldKey, value] of Object.entries(input.values)) {
    if (!trendable.has(fieldKey) || typeof value !== "number" || !Number.isFinite(value)) continue;
    statements.push(
      db.prepare(`INSERT INTO derived_numeric_observations(projection_id,projection_revision,form_key,field_key,plant_date,measured_at,numeric_value,is_current) VALUES(?,?,?,?,?,?,?,1)`)
        .bind(input.projectionId, input.projectionRevision, input.formKey, fieldKey, input.plantDate, measuredAt, value),
    );
  }
  return statements;
}
