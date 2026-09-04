// @ts-expect-error The worker tsconfig intentionally excludes Node's ambient types; Vitest runs this import in Node.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { calculateForm5And6 } from "../shared/formulas";
import { normalizeContext } from "../shared/safetyContract";
import { buildBackupGeneration } from "../worker/domain/backup";
import { upsertCompletedRecord, validateCompletedUpload } from "../worker/domain/localFirst";
import { validateFormValues } from "../worker/domain/validation";

const FORM_2_CONTEXT = { date: "2026-09-03", shift: "Day" as const, boilerNumber: 2 as const };
const OFFLINE_DB_SOURCE = readFileSync("src/lib/offlineDb.ts", "utf8");
const SYNC_SOURCE = readFileSync("src/lib/sync.ts", "utf8");
const FORM_ENTRY_SOURCE = readFileSync("src/pages/FormEntryPage.tsx", "utf8");
const FORM_RENDERER_SOURCE = readFileSync("src/components/FormRenderer.tsx", "utf8");
const STYLES_SOURCE = readFileSync("src/styles.css", "utf8");

function form2Upload(values: Record<string, unknown> = {}, overrides: Record<string, unknown> = {}) {
  return {
    protocolVersion: 2,
    record: {
      aggregateId: "form-2-entry",
      formKey: "boiler-water-control-tests",
      revision: 0,
      publishedRevision: null,
      lifecycle: "completed",
      operatorId: "operator-marj",
      operator: "Marj",
      ...FORM_2_CONTEXT,
      values,
      createdAt: "2026-09-03T12:00:00.000Z",
      updatedAt: "2026-09-03T12:00:00.000Z",
      ...overrides,
    },
    localVersion: 3,
    clientUpdatedAt: "2026-09-03T12:00:00.000Z",
  };
}

describe("Phase 4 Form 2 local-first validation", () => {
  it("authoritatively recomputes OH-ALK and ignores a client-supplied calculated value", () => {
    const result = validateCompletedUpload(form2Upload({ p_alk: 450, m_alk: 600, oh_alk: 999 }));

    expect(result.record.values).toMatchObject({ p_alk: 450, m_alk: 600, oh_alk: 300 });
    expect(result.record.contextKey).toBe("2026-09-03|shift=Day|boiler=2");
  });

  it("allows a completed Form 2 with blank readings when operator and context are valid", () => {
    const result = validateCompletedUpload(form2Upload());

    expect(result.record.lifecycle).toBe("completed");
    expect(result.record.operatorId).toBe("operator-marj");
    expect(result.record.values).toEqual({ oh_alk: null });
  });

  it("requires the selected operator but does not require any reading value", () => {
    expect(() => validateCompletedUpload(form2Upload({}, { operatorId: null, operator: "" }))).toThrow(
      "Select an operator before completing a record.",
    );
    expect(() => validateFormValues("boiler-water-control-tests", 2, FORM_2_CONTEXT, {})).not.toThrow();
  });
});

describe("Phase 4 Form 5 and Form 6 dependency edges", () => {
  it("stays current when both exact-date source rows exist even if every reading is blank", () => {
    const result = calculateForm5And6({
      currentValues: {},
      previousValues: {},
      currentDate: "2026-09-03",
      previousDate: "2026-09-02",
      hasCurrent: true,
      hasPrevious: true,
    });

    expect(result.status).toBe("current");
    expect(result.warnings).toEqual([]);
    expect(result.form5.total_steam).toBeNull();
    expect(result.form5.makeup_water_gallon).toBeNull();
    expect(result.form6.cw_makeup_used).toBeNull();
  });

  it("reports Waiting for the exact previous calendar date and withholds deltas", () => {
    const result = calculateForm5And6({
      currentValues: { gas_boiler3: 100, steam_boiler3: 200, cw_makeup: 400 },
      previousValues: { gas_boiler3: 90, steam_boiler3: 190, cw_makeup: 390 },
      currentDate: "2026-03-09",
      previousDate: "2026-03-08",
      hasCurrent: true,
      hasPrevious: false,
    });

    expect(result.status).toBe("waiting");
    expect(result.form5.boiler3_gas_used).toBeNull();
    expect(result.form5.boiler3_steam_used).toBeNull();
    expect(result.form6.cw_makeup_used).toBeNull();
    expect(result.warnings).toContain("Waiting for completed Form 8 on previous calendar date 2026-03-08.");
  });

  it("keeps negative cumulative deltas visible while warning instead of silently clamping them", () => {
    const result = calculateForm5And6({
      currentValues: { gas_boiler3: 90, steam_boiler3: 90, hotwell_makeup: 90, cw_makeup: 90 },
      previousValues: { gas_boiler3: 100, steam_boiler3: 100, hotwell_makeup: 100, cw_makeup: 100 },
      currentDate: "2026-09-03",
      previousDate: "2026-09-02",
      hasCurrent: true,
      hasPrevious: true,
    });

    expect(result.form5.boiler3_gas_used).toBe(-10);
    expect(result.form5.boiler3_steam_used).toBe(-10);
    expect(result.form5.makeup_water_gallon).toBe(-10);
    expect(result.form6.cw_makeup_used).toBe(-10);
    expect(result.warnings).toEqual(expect.arrayContaining([
      expect.stringContaining("Boiler 3 gas"),
      expect.stringContaining("Boiler 3 steam"),
      expect.stringContaining("Hotwell makeup"),
      expect.stringContaining("C.W. Makeup"),
    ]));
  });
});

type LatestRow = Record<string, any>;

function latestRow(input: Partial<LatestRow>): LatestRow {
  return {
    aggregate_id: "aggregate-a",
    form_key: "ecc-cooling-tower-water-control-tests",
    form_version: 1,
    context_key: "2026-09-03|shift=Day",
    operator_id: "operator-marj",
    operator_name: "Marj",
    plant_date: "2026-09-03",
    shift: "Day",
    time_slot: null,
    boiler_number: null,
    values_json: JSON.stringify({ ph: 8 }),
    local_revision: 1,
    created_at: "2026-09-03T09:00:00.000Z",
    updated_at: "2026-09-03T09:00:00.000Z",
    client_updated_at: "2026-09-03T09:00:00.000Z",
    freshness_tiebreaker: "aggregate-a",
    ...input,
  };
}

class LocalFirstDb {
  rows = new Map<string, LatestRow>();
  byAggregate = new Map<string, LatestRow>();
  sql: string[] = [];

  constructor(row?: LatestRow) {
    if (row) this.setRow(row);
  }

  setRow(row: LatestRow) {
    this.rows.set(`${row.form_key}|${row.context_key}`, row);
    this.byAggregate.set(row.aggregate_id, row);
  }

  prepare(sql: string) {
    this.sql.push(sql);
    const db = this;
    const statement: any = {
      args: [] as unknown[],
      bind(...args: unknown[]) { statement.args = args; return statement; },
      async first<T>() {
        if (sql.includes("WHERE form_key=? AND context_key=?")) return db.rows.get(`${statement.args[0]}|${statement.args[1]}`) as T | undefined;
        if (sql.includes("WHERE aggregate_id=?")) return db.byAggregate.get(String(statement.args[0])) as T | undefined;
        return undefined;
      },
      async run() {
        if (sql.trimStart().startsWith("INSERT INTO latest_completed_records")) {
          const [aggregateId, formKey, formVersion, contextKey, operatorId, operatorName, plantDate, shift, timeSlot, boilerNumber, valuesJson, localRevision, createdAt, updatedAt, clientUpdatedAt, freshnessTiebreaker] = statement.args;
          const key = `${formKey}|${contextKey}`;
          const existing = db.rows.get(key);
          const incomingTime = Date.parse(String(clientUpdatedAt));
          const existingTime = existing ? Date.parse(String(existing.client_updated_at)) : Number.NEGATIVE_INFINITY;
          const incomingIsNewer = !existing || incomingTime > existingTime || (incomingTime === existingTime && (Number(localRevision) > Number(existing.local_revision) || (Number(localRevision) === Number(existing.local_revision) && String(freshnessTiebreaker) > String(existing.freshness_tiebreaker))));
          if (incomingIsNewer) {
            if (existing) db.byAggregate.delete(existing.aggregate_id);
            db.setRow({ aggregate_id: String(aggregateId), form_key: String(formKey), form_version: Number(formVersion), context_key: String(contextKey), operator_id: operatorId, operator_name: String(operatorName), plant_date: String(plantDate), shift, time_slot: timeSlot, boiler_number: boilerNumber, values_json: String(valuesJson), local_revision: Number(localRevision), created_at: String(createdAt), updated_at: String(updatedAt), client_updated_at: String(clientUpdatedAt), freshness_tiebreaker: String(freshnessTiebreaker) });
          }
        }
        return { success: true };
      },
    };
    return statement;
  }
}

function uploadFor(input: { aggregateId: string; clientUpdatedAt: string; localVersion: number; values?: Record<string, unknown> }) {
  return {
    protocolVersion: 2,
    record: {
      aggregateId: input.aggregateId,
      formKey: "ecc-cooling-tower-water-control-tests",
      contextKey: "2026-09-03|shift=Day",
      revision: input.localVersion,
      publishedRevision: input.localVersion,
      lifecycle: "completed",
      operatorId: "operator-marj",
      operator: "Marj",
      date: "2026-09-03",
      shift: "Day",
      timeSlot: null,
      boilerNumber: null,
      values: { ph: 8, ...input.values },
      createdAt: input.clientUpdatedAt,
      updatedAt: input.clientUpdatedAt,
    },
    localVersion: input.localVersion,
    clientUpdatedAt: input.clientUpdatedAt,
  };
}

describe("Phase 4 v2 upload freshness", () => {
  it("orders competing aggregate IDs by timestamp, then local version, then ID", async () => {
    const db = new LocalFirstDb(latestRow({ aggregate_id: "aggregate-a" }));
    const sameTime = "2026-09-03T09:00:00.000Z";

    const accepted = await upsertCompletedRecord(db as never, uploadFor({ aggregateId: "aggregate-b", clientUpdatedAt: sameTime, localVersion: 1, values: { ph: 9 } }));
    expect(accepted.outcome).toBe("accepted");
    expect(accepted.record.aggregateId).toBe("aggregate-b");

    const stale = await upsertCompletedRecord(db as never, uploadFor({ aggregateId: "aggregate-a", clientUpdatedAt: sameTime, localVersion: 1, values: { ph: 7 } }));
    expect(stale.outcome).toBe("stale");
    expect(stale.record.aggregateId).toBe("aggregate-b");
    expect(stale.record.values.ph).toBe(9);
  });

  it("rejects an older upload from the same aggregate without changing the latest row", async () => {
    const db = new LocalFirstDb(latestRow({ aggregate_id: "aggregate-a", local_revision: 4, client_updated_at: "2026-09-03T10:00:00.000Z", freshness_tiebreaker: "aggregate-a" }));
    const result = await upsertCompletedRecord(db as never, uploadFor({ aggregateId: "aggregate-a", clientUpdatedAt: "2026-09-03T09:00:00.000Z", localVersion: 3, values: { ph: 7 } }));

    expect(result.outcome).toBe("stale");
    expect(result.record.values.ph).toBe(8);
  });
});

class BackupDb {
  preparedSql: string[] = [];
  prepare(sql: string) {
    this.preparedSql.push(sql);
    const statement: any = {
      args: [] as unknown[],
      bind(...args: unknown[]) { statement.args = args; return statement; },
      async first() { return null; },
      async run() { return { success: true }; },
    };
    return statement;
  }

  async batch(statements: any[]) {
    if (statements.length === 3) {
      return [
        { results: [{
          revision_id: "local-entry-1-2",
          aggregate_id: "entry-1",
          revision: 2,
          form_key: "ecc-cooling-tower-water-control-tests",
          form_version: 1,
          lifecycle: "completed",
          operator_id: "operator-marj",
          operator_name: "Marj",
          plant_date: "2026-09-03",
          shift: "Day",
          time_slot: null,
          boiler_number: null,
          values_json: JSON.stringify({ ph: 8 }),
          provenance_json: null,
          created_at: "2026-09-03T12:00:00.000Z",
        }] },
        { results: [{
          projection_id: "projection-5",
          form_key: "daily-consumption-totals",
          plant_date: "2026-09-03",
          revision: 1,
          status: "waiting",
          source_revisions_json: "[]",
          effective_values_json: JSON.stringify({ total_steam: null }),
          warnings_json: JSON.stringify(["Waiting for completed Form 8 on previous calendar date 2026-09-02."]),
        }] },
        { results: [{ boundary: "2026-09-03 12:01:00" }] },
      ];
    }
    return [];
  }
}

describe("Phase 4 backup and migration contracts", () => {
  it("backs up latest local-first rows and does not block on a Waiting projection", async () => {
    const db = new BackupDb();
    const result = await buildBackupGeneration(db as never, "2026-09-03");

    expect(result.ready).toBe(true);
    const payload = JSON.parse(result.generation!.canonical_json!);
    const form1 = payload.forms.find((form: any) => form.formId === "ecc-cooling-tower-water-control-tests");
    const form5 = payload.forms.find((form: any) => form.formId === "daily-consumption-totals");
    expect(form1.entries).toHaveLength(1);
    expect(form1.entries[0]).toMatchObject({ recordType: "published_revision", aggregateId: "entry-1", manualAdjustments: null });
    expect(form5.entries[0]).toMatchObject({ recordType: "derived_projection", status: "waiting", manualAdjustments: null });
    expect(db.preparedSql.find((sql) => sql.includes("FROM latest_completed_records"))).not.toContain("published_records");
  });

  it("asserts migration 0003 only backfills the latest published legacy row and preserves existing local-first rows", () => {
    const sql = readFileSync("migrations/0003_local_first_backfill.sql", "utf8");

    expect(sql).toContain("FROM published_records p");
    expect(sql).toContain("ROW_NUMBER() OVER");
    expect(sql).toContain("PARTITION BY p.form_key, p.context_key");
    expect(sql).toContain("ORDER BY p.revision DESC, p.revision_id DESC");
    expect(sql).toContain("WHERE row_number = 1");
    expect(sql).toContain("AND NOT EXISTS (");
    expect(sql).toContain("l.form_key = legacy_latest.form_key");
    expect(sql).toContain("l.context_key = legacy_latest.context_key");
    const legacyBackfill = sql.slice(sql.indexOf("WITH legacy_latest"));
    expect(legacyBackfill).not.toMatch(/UPDATE\s+latest_completed_records/i);
  });
});

describe("Phase 4 safety/context normalization", () => {
  it("owns every context dimension required by the form and rejects malformed dimensions", () => {
    expect(normalizeContext("ecc-cooling-tower-water-control-tests", { date: "2026-09-03", shift: "Night" })).toBe("2026-09-03|shift=Night");
    expect(normalizeContext("yst-yk-chiller", { date: "2026-09-03", timeSlot: "22:00" })).toBe("2026-09-03|time=22:00");
    expect(normalizeContext("boiler-water-control-tests", FORM_2_CONTEXT)).toBe("2026-09-03|shift=Day|boiler=2");
    expect(() => normalizeContext("yst-yk-chiller", { date: "2026-09-03", timeSlot: "23:00" })).toThrow("valid two-hour time slot");
  });
});

describe("Phase 4 Terra P1 local-first blockers", () => {
  it("enforces completed context uniqueness inside the IndexedDB write transaction while leaving incomplete drafts eligible", () => {
    expect(OFFLINE_DB_SOURCE).toContain('offlineDb.transaction("rw",offlineDb.entries');
    expect(OFFLINE_DB_SOURCE).toContain("completedContextCollision(next)");
    expect(OFFLINE_DB_SOURCE).toContain('if(!next.contextKey)return null;');
    expect(OFFLINE_DB_SOURCE).toContain('next.status==="completed"&&!next.contextKey');
    expect(OFFLINE_DB_SOURCE).toContain("Open it, replace it explicitly, or choose another context.");
  });

  it("keeps temporary replacement and cancellation local until an explicit Complete", () => {
    expect(OFFLINE_DB_SOURCE).toContain('entry.temporaryEdit)throw new Error("Temporary edits must be explicitly completed before upload.")');
    expect(OFFLINE_DB_SOURCE).toContain('!saved.temporaryEdit&&options.queueCompleted!==false');
    expect(OFFLINE_DB_SOURCE).toContain('replaceLocalEntry(restored.entryId,restored,{queueCompleted:false})');
    expect(FORM_ENTRY_SOURCE).toContain('temporaryEdit:duplicate.status==="completed"');
    expect(FORM_ENTRY_SOURCE).toContain('await enqueueCompleted(saved)');
  });

  it("offers only current-date unfinished drafts before contextual fresh entry", () => {
    expect(FORM_ENTRY_SOURCE).toContain('const matching=drafts.filter(candidate=>candidate.status==="draft"&&candidate.context.date===plantDate)');
    expect(FORM_ENTRY_SOURCE).toContain('setAvailableDrafts(matching)');
    expect(FORM_ENTRY_SOURCE).toContain('draft.operator||"Operator not selected"');
    expect(FORM_ENTRY_SOURCE).toContain('function startFreshEntry()');
    expect(FORM_ENTRY_SOURCE).not.toContain('const matching=drafts.find(candidate=>candidate.status==="draft"&&candidate.context.date===todayPlantDate())');
  });

  it("does not carry persistence errors across entries or after a successful cancel", () => {
    expect(FORM_ENTRY_SOURCE).toContain('setAvailableDrafts(null);setMessage(null);setDuplicate(null)');
    expect(FORM_ENTRY_SOURCE).toContain('const failed={...next,storageError:text};entryRef.current=failed;setEntry(failed);setMessage(text);');
    expect(FORM_ENTRY_SOURCE).toContain('setMessage(null);}catch(error){');
  });

  it("treats a completed-context collision as a selection workflow, not a storage failure", () => {
    expect(FORM_ENTRY_SOURCE).toContain('isDuplicateSelectionError(error)');
    expect(FORM_ENTRY_SOURCE).toContain('if(error instanceof DuplicateContextError)setDuplicate(error.collision)');
    expect(FORM_ENTRY_SOURCE).toContain('setMessage(null);');
    expect(FORM_ENTRY_SOURCE).toContain('setMessage(null);void queueSave(next)');
    expect(FORM_ENTRY_SOURCE).toContain('setDuplicate(null);setMessage(null)');
    expect(FORM_ENTRY_SOURCE).toContain('const duplicateSelection={...next,storageError:null}');
  });

  it("surfaces a completed collision when an existing draft changes context", () => {
    expect(OFFLINE_DB_SOURCE).toContain("export class DuplicateContextError");
    expect(OFFLINE_DB_SOURCE).toContain("if(error instanceof DuplicateContextError)throw error");
    expect(FORM_ENTRY_SOURCE).toContain('if(error instanceof DuplicateContextError)setDuplicate(error.collision)');
  });

  it("clears duplicate context selection while preserving date, operator, and readings", () => {
    expect(FORM_ENTRY_SOURCE).toContain('dismissedDuplicateContext.current=null;setDuplicate(null);setMessage(null);commit(e=>({...e,context:{...e.context,...(form.hasShift?{shift:null}:{}),...(form.hasTimeSlot?{timeSlot:null}:{}),...(form.hasBoiler?{boilerNumber:null}:{})}}))');
  });

  it("locks only freshly created entries until required metadata is complete", () => {
    expect(FORM_ENTRY_SOURCE).toContain('const[isNewEntry,setIsNewEntry]=useState(false)');
    expect(FORM_ENTRY_SOURCE).toContain('if(!loaded){loaded=newLocalEntry(formKey,plantDate);setIsNewEntry(true);}');
    expect(FORM_ENTRY_SOURCE).toContain('const missing=isNewEntry&&!locked?missingMetadata(form,entry):[]');
    expect(FORM_ENTRY_SOURCE).toContain('entry-content-gate ${metadataLocked?"is-locked":""}');
    expect(FORM_ENTRY_SOURCE).toContain('Complete the metadata above to begin entering this form.');
    expect(STYLES_SOURCE).toContain('.entry-content-gate.is-locked .entry-content');
    expect(STYLES_SOURCE).toContain('filter: blur(4px)');
  });

  it("renders binary form selects as accessible selected toggle buttons", () => {
    expect(FORM_RENDERER_SOURCE).toContain("options.length===2");
    expect(FORM_RENDERER_SOURCE).toContain('type="button"');
    expect(FORM_RENDERER_SOURCE).toContain("aria-pressed={selected}");
    expect(FORM_RENDERER_SOURCE).toContain("onClick={()=>onChange(o.value)}");
    expect(FORM_RENDERER_SOURCE).toContain('className={`toggle-button ${selected?"selected":""}`}');
    expect(FORM_RENDERER_SOURCE).toContain("<select disabled={selectDisabled}");
  });

  it("claims only exact-version pending/retry items and prevents concurrent replay", () => {
    expect(OFFLINE_DB_SOURCE).toContain('item?.status==="pending"||item?.status==="retry"');
    expect(OFFLINE_DB_SOURCE).toContain('item.status!=="uploading"');
    expect(SYNC_SOURCE).toContain("let replaying=false;");
    expect(SYNC_SOURCE).toContain("if(!navigator.onLine||replaying)return;");
  });
});
