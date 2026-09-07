import { nextCalendarDate } from "../../shared/safetyContract";
import { canonicalRecordId } from "../../shared/canonical";
import { deriveForm8OatExtrema, type OatSourceRecord } from "../../shared/form8Oat";
import { calculateForm5And6, DERIVED_FORMULA_VERSION } from "../../shared/formulas";
import type { Values } from "../../shared/types";
import { stableStringify } from "./hash";
import { derivedNumericStatements } from "./trends";

export const FORMULA_VERSION = DERIVED_FORMULA_VERSION;

export type DerivedSourceRow = {
  revision_id: string;
  aggregate_id: string;
  revision: number;
  plant_date: string;
  values_json: string;
};

type SourceRow = DerivedSourceRow;
type OatSourceRow = DerivedSourceRow & { time_slot: string | null };

async function sourceForDate(db: D1Database, plantDate: string): Promise<SourceRow | null> {
  const latest = await db.prepare(`SELECT canonical_id,revision,plant_date,values_json FROM canonical_records WHERE form_key='integrator-readings' AND plant_date=? LIMIT 1`).bind(plantDate).first<any>();
  return latest
    ? { revision_id: `${latest.canonical_id}@r${latest.revision}`, aggregate_id: latest.canonical_id, revision: Number(latest.revision), plant_date: latest.plant_date, values_json: latest.values_json }
    : null;
}

async function oatSourcesForDate(db: D1Database, plantDate: string): Promise<{ rows: OatSourceRow[]; records: OatSourceRecord[] }> {
  const result = await db.prepare(`
    SELECT canonical_id,revision,plant_date,time_slot,values_json
    FROM canonical_records
    WHERE form_key='gas-turbine-log-sheet' AND plant_date=?
    ORDER BY time_slot,revision DESC,canonical_id
  `).bind(plantDate).all<any>();
  const rows = (result.results ?? []).map((row): OatSourceRow => ({
    revision_id: `${row.canonical_id}@r${row.revision}`,
    aggregate_id: row.canonical_id,
    revision: Number(row.revision),
    plant_date: row.plant_date,
    time_slot: row.time_slot ?? null,
    values_json: row.values_json,
  }));
  return {
    rows,
    records: rows.map((row) => ({
      date: row.plant_date,
      timeSlot: row.time_slot,
      values: JSON.parse(row.values_json) as Values,
      status: "completed",
      lifecycle: "completed",
    })),
  };
}

export function sourceRefs(rows: readonly DerivedSourceRow[]) {
  return rows.map((r) => ({ aggregateId: r.aggregate_id, revisionId: r.revision_id, revision: Number(r.revision), plantDate: r.plant_date }));
}

/** Apply the authoritative same-date Form 9 OAT extrema to a Form 5 result. */
export function applyForm5OatExtrema(form5Values: Values, sourceRecords: readonly OatSourceRecord[], sourceDate: string): Values {
  const extrema = deriveForm8OatExtrema(sourceRecords, sourceDate, "oat_memorial");
  return {
    ...form5Values,
    oat_high: extrema.status === "ready" ? extrema.values.oat_high ?? null : null,
    oat_low: extrema.status === "ready" ? extrema.values.oat_low ?? null : null,
  };
}

async function upsertProjection(db: D1Database, formKey: "daily-consumption-totals"|"makeup", plantDate: string, baseValues: Values, status: "current"|"waiting", refs: ReturnType<typeof sourceRefs>, warnings: string[]) {
  const existing = await db.prepare(`SELECT projection_id,revision,status,formula_version,source_revisions_json,base_values_json,effective_values_json,warnings_json FROM derived_projections WHERE form_key=? AND plant_date=?`).bind(formKey, plantDate).first<{projection_id:string;revision:number;status:string;formula_version:number;source_revisions_json:string;base_values_json:string;effective_values_json:string;warnings_json:string}>();
  const projectionId = existing?.projection_id ?? canonicalRecordId(formKey, plantDate);
  await db.prepare(`UPDATE projection_adjustments SET active=0,superseded_at=COALESCE(superseded_at,CURRENT_TIMESTAMP) WHERE projection_id=? AND active=1`).bind(projectionId).run();
  await db.prepare(`UPDATE attention_items SET resolved_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE plant_date=? AND resolved_at IS NULL AND code IN ('daily-consumption-totals_manual_adjustment_review','makeup_manual_adjustment_review')`).bind(plantDate).run();
  const refsJson = stableStringify(refs);
  const baseJson = stableStringify(baseValues);
  const warningsJson = stableStringify(warnings);
  // Projection adjustments are retained only as old compatibility history. They
  // are never read into an active Form 5/6 result.
  const effective: Values = { ...baseValues };
  const effectiveJson = stableStringify(effective);
  const finalStatus = status;

  const unchanged = existing
    && existing.status === finalStatus
    && Number(existing.formula_version) === FORMULA_VERSION
    && stableStringify(JSON.parse(existing.source_revisions_json)) === refsJson
    && stableStringify(JSON.parse(existing.base_values_json)) === baseJson
    && stableStringify(JSON.parse(existing.effective_values_json)) === effectiveJson
    && stableStringify(JSON.parse(existing.warnings_json)) === warningsJson;
  if (unchanged) return { projectionId, revision: Number(existing.revision), status: finalStatus, changed: false };

  const revision = Number(existing?.revision ?? 0) + 1;
  const statements: D1PreparedStatement[] = [];
  if (existing) {
    statements.push(db.prepare(`UPDATE derived_projections SET revision=?,status=?,formula_version=?,source_revisions_json=?,base_values_json=?,effective_values_json=?,warnings_json=?,updated_at=CURRENT_TIMESTAMP WHERE projection_id=?`)
      .bind(revision, finalStatus, FORMULA_VERSION, refsJson, baseJson, effectiveJson, warningsJson, projectionId));
  } else {
    statements.push(db.prepare(`INSERT INTO derived_projections(projection_id,form_key,plant_date,revision,status,formula_version,source_revisions_json,base_values_json,effective_values_json,warnings_json) VALUES(?,?,?,?,?,?,?,?,?,?)`)
      .bind(projectionId, formKey, plantDate, revision, finalStatus, FORMULA_VERSION, refsJson, baseJson, effectiveJson, warningsJson));
  }
  statements.push(...derivedNumericStatements(db, {
    projectionId,
    projectionRevision: revision,
    formKey,
    plantDate,
    values: effective,
  }));
  statements.push(db.prepare(`INSERT INTO backup_dirty_dates(plant_date,reason,first_dirty_at,last_dirty_at) VALUES(?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
    ON CONFLICT(plant_date) DO UPDATE SET reason=excluded.reason,last_dirty_at=CURRENT_TIMESTAMP`).bind(plantDate, `${formKey} projection revision changed`));
  await db.batch(statements);
  return { projectionId, revision, status: finalStatus, changed: true };
}

export async function recomputeDerivedDate(db: D1Database, plantDate: string) {
  const previousDate = nextCalendarDate(plantDate, -1);
  const current = await sourceForDate(db, plantDate);
  const previous = await sourceForDate(db, previousDate);
  const refs = sourceRefs([...(previous ? [previous] : []), ...(current ? [current] : [])]);
  const currentValues = current ? JSON.parse(current.values_json) as Values : {};
  const previousValues = previous ? JSON.parse(previous.values_json) as Values : {};
  const oatSources = await oatSourcesForDate(db, plantDate);
  const calculated = calculateForm5And6({
    currentValues,
    previousValues,
    currentDate: plantDate,
    previousDate,
    hasCurrent: Boolean(current),
    hasPrevious: Boolean(previous),
  });
  const dependencyStatus = calculated.status;
  const warnings = calculated.warnings;
  const form5 = applyForm5OatExtrema(calculated.form5, oatSources.records, plantDate);
  const form6 = calculated.form6;
  const form5Refs = sourceRefs([
    ...(previous ? [previous] : []),
    ...(current ? [current] : []),
    ...oatSources.rows,
  ]);

  const form5Result = await upsertProjection(db, "daily-consumption-totals", plantDate, form5, dependencyStatus, form5Refs, warnings);
  const form6Result = await upsertProjection(db, "makeup", plantDate, form6, dependencyStatus, refs, warnings);
  return { plantDate, form5: form5Result, form6: form6Result, warnings };
}

export async function recomputeAfterIntegratorChange(db: D1Database, plantDate: string) {
  const dates = [plantDate, nextCalendarDate(plantDate, 1)];
  const results = [];
  for (const date of dates) results.push(await recomputeDerivedDate(db, date));
  return results;
}
