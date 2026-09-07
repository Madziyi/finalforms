import { describe, expect, it } from "vitest";
import { canonicalRecordId } from "../shared/canonical";
import { calculateForm5And6 } from "../shared/formulas";
import { getCanonicalTombstone, getLatestCompleted, upsertCompletedRecord, validateCompletedUpload } from "../worker/domain/localFirst";

const context = { date: "2026-09-03", shift: "Day" as const, boilerNumber: 2 as const };

function upload(recordOverrides: Record<string, unknown> = {}, payloadOverrides: Record<string, unknown> = {}) {
  return {
    protocolVersion: 3,
    syncId: "test-sync-1",
    generation: 1,
    localVersion: 4,
    baseRevision: 0,
    clientUpdatedAt: "2026-09-03T12:00:00.000Z",
    record: {
      aggregateId: canonicalRecordId("boiler-water-control-tests", context),
      formKey: "boiler-water-control-tests",
      revision: 4,
      publishedRevision: null,
      lifecycle: "completed",
      operatorId: "operator-marj",
      operator: "Marj",
      ...context,
      values: { p_alk_burette: 11.25, m_alk_burette: 15, p_alk: 999, m_alk: 999, oh_alk: 999 },
      createdAt: "2026-09-03T12:00:00.000Z",
      updatedAt: "2026-09-03T12:00:00.000Z",
      ...recordOverrides,
    },
    ...payloadOverrides,
  };
}

function pumpPairUpload() {
  const pumpContext = { date: "2026-09-03", shift: "Day" as const };
  return upload({
    aggregateId: canonicalRecordId("ecc-cooling-tower-water-control-tests", pumpContext),
    formKey: "ecc-cooling-tower-water-control-tests",
    contextKey: "2026-09-03|shift=Day",
    ...pumpContext,
    boilerNumber: null,
    values: { ct_meter: 1, conductivity: 1150, ph: 8.6, orp: 10, ptsa: 100, pump_sp_st: { first: 75, second: 45 } },
  }, { syncId: "pump-pair-index", generation: 1, localVersion: 1, baseRevision: null });
}

type CanonicalRow = Record<string, any>;

/**
 * A deliberately narrow D1-shaped fake for the canonical upload contract.
 * It models the tables and uniqueness constraint that the domain function
 * actually touches; it is not intended to be a general SQL implementation.
 */
class CanonicalSyncDb {
  rows = new Map<string, CanonicalRow>();
  tombstones = new Map<string, CanonicalRow>();
  receipts = new Map<string, CanonicalRow>();
  observations = new Map<string, CanonicalRow>();

  seedRecord(record: Record<string, any>, generation = 1, revision = record.revision) {
    this.rows.set(record.aggregateId, {
      canonical_id: record.aggregateId,
      form_key: record.formKey,
      form_version: 2,
      context_key: record.contextKey,
      operator_id: record.operatorId,
      operator_name: record.operator,
      plant_date: record.date,
      shift: record.shift,
      time_slot: record.timeSlot,
      boiler_number: record.boilerNumber,
      values_json: JSON.stringify(record.values),
      generation,
      revision,
      created_at: record.createdAt,
      updated_at: record.updatedAt,
      client_updated_at: record.updatedAt,
    });
  }

  prepare(sql: string) {
    const normalized = sql.replace(/\s+/g, " ").trim().toLowerCase();
    const db = this;
    const statement: any = {
      args: [] as unknown[],
      bind(...args: unknown[]) { statement.args = args; return statement; },
      async first<T>() {
        if (normalized.includes("select request_hash,response_json from canonical_sync_receipts where sync_id=?")) {
          const receipt = db.receipts.get(String(statement.args[0]));
          return receipt && { request_hash: receipt.request_hash, response_json: receipt.response_json } as T;
        }
        if (normalized.includes("from canonical_record_tombstones where canonical_id=?")) return db.tombstones.get(String(statement.args[0])) as T | undefined;
        if (normalized.includes("from canonical_records where form_key=? and context_key=?")) {
          return [...db.rows.values()].find((row) => row.form_key === statement.args[0] && row.context_key === statement.args[1]) as T | undefined;
        }
        if (normalized.includes("from canonical_records where canonical_id=?")) return db.rows.get(String(statement.args[0])) as T | undefined;
        return undefined;
      },
      async all<T>() {
        return { results: [...db.rows.values()] as T[] };
      },
      async run() {
        if (normalized.startsWith("delete from numeric_observations")) {
          const aggregateId = String(statement.args[0]);
          for (const [key, row] of db.observations) if (row.aggregate_id === aggregateId) db.observations.delete(key);
        } else if (normalized.startsWith("insert into numeric_observations")) {
          const [aggregateId, formKey, fieldKey, plantDate, measuredAt, numericValue] = statement.args;
          db.observations.set(`${aggregateId}:${fieldKey}`, { aggregate_id: aggregateId, form_key: formKey, field_key: fieldKey, plant_date: plantDate, measured_at: measuredAt, numeric_value: numericValue, is_published: 1 });
        } else if (normalized.startsWith("insert or replace into canonical_record_tombstones")) {
          const [canonicalId, formKey, contextKey, movedToId, generation, revision] = statement.args;
          db.tombstones.set(String(canonicalId), {
            canonical_id: canonicalId, form_key: formKey, context_key: contextKey, moved_to_id: movedToId,
            generation, revision, tombstoned_at: "2026-09-03T12:00:00.000Z",
          });
        } else if (normalized.startsWith("delete from canonical_records")) {
          db.rows.delete(String(statement.args[0]));
        } else if (normalized.startsWith("insert into canonical_records")) {
          const [canonicalId, formKey, formVersion, contextKey, operatorId, operatorName, plantDate, shift, timeSlot, boilerNumber, valuesJson, generation, revision, createdAt, updatedAt, clientUpdatedAt] = statement.args;
          const owner = [...db.rows.values()].find((row) => row.form_key === formKey && row.context_key === contextKey && row.canonical_id !== canonicalId);
          if (owner) throw new Error("UNIQUE constraint failed: canonical_records.form_key, canonical_records.context_key");
          db.rows.set(String(canonicalId), {
            canonical_id: canonicalId, form_key: formKey, form_version: formVersion, context_key: contextKey,
            operator_id: operatorId, operator_name: operatorName, plant_date: plantDate, shift, time_slot: timeSlot,
            boiler_number: boilerNumber, values_json: valuesJson, generation, revision, created_at: createdAt,
            updated_at: updatedAt, client_updated_at: clientUpdatedAt,
          });
        } else if (normalized.startsWith("insert") && normalized.includes("canonical_sync_receipts")) {
          const [syncId, canonicalId, generation, requestHash, outcome, responseJson] = statement.args;
          if (!db.receipts.has(String(syncId))) db.receipts.set(String(syncId), {
            sync_id: syncId, canonical_id: canonicalId, generation, request_hash: requestHash, outcome, response_json: responseJson,
          });
        }
        return { success: true };
      },
    };
    return statement;
  }

  async batch(statements: any[]) {
    const snapshot = new Map(this.rows);
    const tombstoneSnapshot = new Map(this.tombstones);
    const receiptSnapshot = new Map(this.receipts);
    const observationSnapshot = new Map(this.observations);
    try {
      for (const statement of statements) await statement.run();
    } catch (error) {
      this.rows = snapshot;
      this.tombstones = tombstoneSnapshot;
      this.receipts = receiptSnapshot;
      this.observations = observationSnapshot;
      throw error;
    }
    return statements.map(() => ({ success: true }));
  }

  asD1() { return this as unknown as D1Database; }
}

describe("canonical operational identities", () => {
  it("derives a globally namespaced ID from selected context", () => {
    expect(canonicalRecordId("boiler-water-control-tests", context)).toBe("F02-2026-09-03-2-2");
    expect(canonicalRecordId("yst-yk-chiller", { date: "2026-12-27", timeSlot: "03:00" })).toBe("F03-2026-12-27-0300");
  });

  it("accepts the matching canonical identity and recomputes calculated values", () => {
    const result = validateCompletedUpload(upload());
    expect(result.record.contextKey).toBe("2026-09-03|shift=Day|boiler=2");
    expect(result.record.values).toMatchObject({ p_alk: 225, m_alk: 300, oh_alk: 150 });
    expect(result.record.revision).toBe(4);
  });

  it("rejects a UUID or an ID that does not match the selected context", () => {
    expect(() => validateCompletedUpload(upload({ aggregateId: "F02-2026-09-02-2-2" }))).toThrow("aggregateId must exactly match");
  });
});

describe("derived Form 5/6 source requirements", () => {
  it("keeps exact-date blank source readings valid", () => {
    const result = calculateForm5And6({ currentValues: {}, previousValues: {}, currentDate: "2026-09-03", previousDate: "2026-09-02", hasCurrent: true, hasPrevious: true });
    expect(result.status).toBe("current");
    expect(result.form5.makeup_water_gallon).toBeNull();
  });
});

describe("canonical sync race safety", () => {
  it("indexes normalized finite numeric readings for previous-measurement history", async () => {
    const db = new CanonicalSyncDb();
    await upsertCompletedRecord(db.asD1(), upload({}, { syncId: "numeric-index", generation: 1, localVersion: 4, baseRevision: null }));

    expect([...db.observations.values()]).toEqual(expect.arrayContaining([
      expect.objectContaining({ field_key: "p_alk", numeric_value: 225, measured_at: "2026-09-03T12:00:00", is_published: 1 }),
      expect.objectContaining({ field_key: "oh_alk", numeric_value: 150 }),
    ]));
    expect([...db.observations.values()].some((row) => row.field_key === "p_alk_burette" || row.field_key === "m_alk_burette")).toBe(false);
  });

  it("recomputes all alkalinity results from raw burette readings", () => {
    const result = validateCompletedUpload(upload({
      values: { p_alk_burette: 12, m_alk_burette: 15, p_alk: 1, m_alk: 2, oh_alk: 3 },
    }));
    expect(result.record.values).toMatchObject({ p_alk_burette: 12, m_alk_burette: 15, p_alk: 240, m_alk: 300, oh_alk: 180 });
  });

  it("indexes each paired Pump Sp/St component for a combined previous measurement", async () => {
    const db = new CanonicalSyncDb();
    await upsertCompletedRecord(db.asD1(), pumpPairUpload());

    expect([...db.observations.values()]).toEqual(expect.arrayContaining([
      expect.objectContaining({ field_key: "pump_sp_st:first", numeric_value: 75 }),
      expect.objectContaining({ field_key: "pump_sp_st:second", numeric_value: 45 }),
    ]));
  });

  it("keeps tablet generation and localVersion distinct at the validation boundary", () => {
    const result = validateCompletedUpload(upload({}, {
      syncId: "generation-contract",
      generation: 7,
      localVersion: 12,
    }));

    expect(result.generation).toBe(7);
    expect(result.localVersion).toBe(12);
    expect(result.record.generation).toBe(7);
    expect(result.record.revision).toBe(12);

    const legacyAlias = validateCompletedUpload(upload({}, {
      syncId: "generation-legacy-alias",
      generation: undefined,
      localVersion: 9,
    }));
    expect(legacyAlias.generation).toBe(9);
    expect(legacyAlias.localVersion).toBe(9);
  });

  it("turns a lost acknowledgement retry into a duplicate with one server effect", async () => {
    const db = new CanonicalSyncDb();
    const payload = upload({}, { syncId: "lost-ack", generation: 1, localVersion: 4, baseRevision: 0 });

    const accepted = await upsertCompletedRecord(db.asD1(), payload);
    const retried = await upsertCompletedRecord(db.asD1(), structuredClone(payload));

    expect(accepted.outcome).toBe("accepted");
    expect(retried.outcome).toBe("duplicate");
    expect(retried.revision).toBe(accepted.revision);
    expect(db.rows).toHaveLength(1);
    expect(db.receipts).toHaveLength(1);
  });

  it("accepts a newer local generation after an older upload and rejects a delayed older snapshot", async () => {
    const db = new CanonicalSyncDb();
    const older = upload({ values: { p_alk_burette: 11.25, m_alk_burette: 15, p_alk: 999, m_alk: 999, oh_alk: 999 } }, {
      syncId: "generation-1",
      generation: 1,
      localVersion: 4,
      baseRevision: 0,
    });
    const newer = upload({ values: { p_alk_burette: 12.5, m_alk_burette: 15, p_alk: 999, m_alk: 999, oh_alk: 999 } }, {
      syncId: "generation-2",
      generation: 2,
      localVersion: 5,
      baseRevision: 4,
    });

    expect((await upsertCompletedRecord(db.asD1(), older)).outcome).toBe("accepted");
    const acceptedNewer = await upsertCompletedRecord(db.asD1(), newer);
    const delayedOlder = await upsertCompletedRecord(db.asD1(), { ...structuredClone(older), syncId: "generation-1-delayed" });

    expect(acceptedNewer.outcome).toBe("accepted");
    expect(acceptedNewer.record).toMatchObject({ generation: 2, revision: 5 });
    expect(delayedOlder.outcome).toBe("stale");
    expect(delayedOlder.record).toMatchObject({ generation: 2, revision: 5 });
    expect(delayedOlder.record.values).toMatchObject({ p_alk: 250, oh_alk: 200 });
  });

  it("tombstones a moved source so a delayed old upload cannot resurrect it", async () => {
    const db = new CanonicalSyncDb();
    const source = upload({}, { syncId: "move-source", generation: 1, localVersion: 4, baseRevision: 0 });
    const sourceId = source.record.aggregateId;
    const destinationContext = { date: "2026-09-04", shift: "Day" as const, boilerNumber: 2 as const };
    const destinationId = canonicalRecordId("boiler-water-control-tests", destinationContext);
    const move = upload({
      aggregateId: destinationId,
      contextKey: "2026-09-04|shift=Day|boiler=2",
      ...destinationContext,
      values: { p_alk_burette: 11.875, m_alk_burette: 15, p_alk: 999, m_alk: 999, oh_alk: 999 },
    }, { syncId: "move-to-destination", generation: 2, localVersion: 6, baseRevision: 4, movedFromId: sourceId });

    expect((await upsertCompletedRecord(db.asD1(), source)).outcome).toBe("accepted");
    const moved = await upsertCompletedRecord(db.asD1(), move);
    const delayedOld = await upsertCompletedRecord(db.asD1(), { ...structuredClone(source), syncId: "delayed-source-upload" });

    expect(moved.outcome).toBe("accepted");
    expect(moved.record).toMatchObject({ aggregateId: destinationId, generation: 2, revision: 1 });
    expect(await getLatestCompleted(db.asD1(), sourceId)).toBeNull();
    expect(await getLatestCompleted(db.asD1(), destinationId)).toMatchObject({ aggregateId: destinationId, generation: 2, revision: 1 });
    expect(await getCanonicalTombstone(db.asD1(), sourceId)).toMatchObject({
      aggregateId: sourceId,
      lifecycle: "superseded",
      provenance: { movedToId: destinationId },
    });
    expect(delayedOld.outcome).toBe("moved");
    expect(delayedOld.movedToId).toBe(destinationId);
  });

  it("allows a later move back to the former context while old generations still follow the old tombstone", async () => {
    const db = new CanonicalSyncDb();
    const original = upload({}, { syncId: "round-trip-original", generation: 1, localVersion: 4, baseRevision: 0 });
    const originalId = original.record.aggregateId;
    const movedContext = { date: "2026-09-04", shift: "Day" as const, boilerNumber: 2 as const };
    const movedId = canonicalRecordId("boiler-water-control-tests", movedContext);
    const moveAway = upload({ aggregateId: movedId, contextKey: "2026-09-04|shift=Day|boiler=2", ...movedContext }, {
      syncId: "round-trip-away", generation: 2, localVersion: 6, baseRevision: 4, movedFromId: originalId,
    });
    const moveBack = upload({}, {
      syncId: "round-trip-back", generation: 3, localVersion: 7, baseRevision: 1, movedFromId: movedId,
    });

    await upsertCompletedRecord(db.asD1(), original);
    expect((await upsertCompletedRecord(db.asD1(), moveAway)).outcome).toBe("accepted");
    const returned = await upsertCompletedRecord(db.asD1(), moveBack);
    const delayedOriginal = await upsertCompletedRecord(db.asD1(), { ...structuredClone(original), syncId: "round-trip-old-arrival" });

    expect(returned.outcome).toBe("accepted");
    expect(returned.record).toMatchObject({ aggregateId: originalId, generation: 3, revision: 1 });
    expect(await getLatestCompleted(db.asD1(), movedId)).toBeNull();
    expect(await getLatestCompleted(db.asD1(), originalId)).toMatchObject({ aggregateId: originalId, generation: 3, revision: 1 });
    expect(delayedOriginal.outcome).toBe("moved");
    expect(delayedOriginal.movedToId).toBe(movedId);
  });

  it("replaces an occupied context only with an explicit move and keeps one canonical owner", async () => {
    const db = new CanonicalSyncDb();
    const destinationContext = { date: "2026-09-04", shift: "Day" as const, boilerNumber: 2 as const };
    const source = upload({}, { syncId: "replace-source-seed", generation: 1, localVersion: 4, baseRevision: 0 });
    const destinationId = canonicalRecordId("boiler-water-control-tests", destinationContext);
    const destination = upload({
      aggregateId: destinationId,
      contextKey: "2026-09-04|shift=Day|boiler=2",
      ...destinationContext,
      values: { p_alk_burette: 10, m_alk_burette: 15, p_alk: 999, m_alk: 999, oh_alk: 999 },
    }, { syncId: "replace-destination-seed", generation: 1, localVersion: 4, baseRevision: 0 });
    const replacement = upload({
      aggregateId: destinationId,
      contextKey: "2026-09-04|shift=Day|boiler=2",
      ...destinationContext,
      values: { p_alk_burette: 13.125, m_alk_burette: 15, p_alk: 999, m_alk: 999, oh_alk: 999 },
    }, { syncId: "replace-explicit", generation: 2, localVersion: 8, baseRevision: 4, movedFromId: source.record.aggregateId });

    await upsertCompletedRecord(db.asD1(), source);
    await upsertCompletedRecord(db.asD1(), destination);
    const replaced = await upsertCompletedRecord(db.asD1(), replacement);

    expect(replaced.outcome).toBe("accepted");
    expect(replaced.record).toMatchObject({ aggregateId: destinationId, generation: 2, revision: 1 });
    expect(replaced.record.values).toMatchObject({ p_alk: 262.5, oh_alk: 225 });
    expect([...db.rows.values()].filter((row) => row.form_key === replacement.record.formKey && row.context_key === "2026-09-04|shift=Day|boiler=2")).toHaveLength(1);
    expect(await getLatestCompleted(db.asD1(), source.record.aggregateId)).toBeNull();
    expect(await getCanonicalTombstone(db.asD1(), source.record.aggregateId)).toMatchObject({ provenance: { movedToId: destinationId } });
  });
});
