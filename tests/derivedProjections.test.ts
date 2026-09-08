import { describe, expect, it } from "vitest";
import { canonicalRecordId } from "../shared/canonical";
import { normalizeContext } from "../shared/safetyContract";
import type { CanonicalRecord, Values } from "../shared/types";
import {
  mergeSourcesByContext,
  resolveDerivedProjection,
  resolveDerivedHistory,
  derivedTrendPoints,
  selectExactSource,
  type ProjectionSource,
} from "../src/lib/derivedProjections";
import type { LocalEntry } from "../src/lib/offlineDb";
import { saveLocalEntry } from "../src/lib/offlineDb";

const currentDate = "2026-09-06";
const previousDate = "2026-09-05";

const values = (overrides: Values = {}): Values => ({
  gas_boiler2: 100,
  steam_boiler2: 1000,
  gas_boiler3: 200,
  steam_boiler3: 2000,
  gas_boiler4: 300,
  steam_boiler4: 3000,
  hotwell_makeup: 400,
  cw_makeup: 500,
  tower_makeup: 600,
  ...overrides,
});

function localEntry(formKey: string, date: string, entryValues: Values, timeSlot: string | null = null, overrides: Partial<LocalEntry> = {}): LocalEntry {
  const context = { date, timeSlot };
  return {
    entryId: canonicalRecordId(formKey, context),
    formKey,
    formVersion: 2,
    contextKey: normalizeContext(formKey, context),
    context,
    operatorId: "operator-test",
    operator: "Test",
    values: entryValues,
    status: "completed",
    localVersion: 2,
    createdAt: `${date}T01:00:00.000Z`,
    updatedAt: `${date}T02:00:00.000Z`,
    completedAt: `${date}T02:00:00.000Z`,
    temporaryEdit: false,
    baseRevision: 1,
    storageError: null,
    uploadError: null,
    ...overrides,
  };
}

function cloudRecord(formKey: string, date: string, recordValues: Values, timeSlot: string | null = null, overrides: Partial<CanonicalRecord> = {}): CanonicalRecord {
  const context = { date, timeSlot };
  return {
    aggregateId: canonicalRecordId(formKey, context),
    formKey,
    contextKey: normalizeContext(formKey, context),
    revision: 7,
    generation: 7,
    publishedRevision: 7,
    lifecycle: "completed",
    operatorId: "operator-cloud",
    operator: "Cloud",
    date,
    shift: null,
    timeSlot,
    boilerNumber: null,
    values: recordValues,
    createdAt: `${date}T03:00:00.000Z`,
    updatedAt: `${date}T04:00:00.000Z`,
    provenance: { status: "current" },
    ...overrides,
  };
}

function source(origin: "local" | "cloud", formKey: string, date: string, id: string): ProjectionSource {
  return {
    aggregateId: id,
    contextKey: normalizeContext(formKey, { date }),
    formKey,
    date,
    revision: 1,
    updatedAt: `${date}T01:00:00.000Z`,
    createdAt: `${date}T01:00:00.000Z`,
    origin,
    values: {},
  };
}

describe("client Form 5/6 local-first projections", () => {
  it("selects local exact contexts over cloud and fills only missing contexts", () => {
    const local = source("local", "integrator-readings", currentDate, "local-current");
    const remote = source("cloud", "integrator-readings", currentDate, "cloud-current");
    expect(selectExactSource([local], [remote], local.contextKey)).toBe(local);
    expect(mergeSourcesByContext([local], [remote, source("cloud", "integrator-readings", previousDate, "cloud-previous")])).toEqual(expect.arrayContaining([local, expect.objectContaining({ aggregateId: "cloud-previous" })]));
  });

  it.each([
    ["local current + cloud previous", [localEntry("integrator-readings", currentDate, values({ cw_makeup: 700 }))], [cloudRecord("integrator-readings", previousDate, values({ cw_makeup: 500 }))]],
    ["cloud current + local previous", [localEntry("integrator-readings", previousDate, values({ cw_makeup: 500 }))], [cloudRecord("integrator-readings", currentDate, values({ cw_makeup: 700 }))]],
  ])("calculates a current hybrid projection for %s", async (_label, local, remote) => {
    const result = await resolveDerivedProjection("makeup", currentDate, {
      online: true,
      localForm8: local,
      localForm9: [],
      fetchSources: async (_formKey, date) => remote.filter(record => record.date === date),
    });
    expect(result.status).toBe("current");
    expect(result.origin).toBe("hybrid");
    expect(result.record?.aggregateId).toBe(canonicalRecordId("makeup", currentDate));
  });

  it("uses a current cloud projection when there are no local overrides", async () => {
    const projection = cloudRecord("daily-consumption-totals", currentDate, { total_steam: 123, makeup_water_gallon: 45 }, null, { provenance: { status: "current" } });
    const result = await resolveDerivedProjection("daily-consumption-totals", currentDate, {
      online: true,
      localForm8: [],
      localForm9: [],
      cloudProjection: projection,
      fetchSources: async () => [],
    });
    expect(result.origin).toBe("cloud");
    expect(result.status).toBe("current");
    expect(result.record?.values.total_steam).toBe(123);
  });

  it("reconciles a cloud Form 5 OAT overlay through the same exact-date Form 9 slots", async () => {
    const projection = cloudRecord("daily-consumption-totals", currentDate, { oat_high: 99, oat_low: 1, total_steam: 123 }, null, { provenance: { status: "current" } });
    const result = await resolveDerivedProjection("daily-consumption-totals", currentDate, {
      online: true, localForm8: [], localForm9: [], cloudProjection: projection,
      fetchSources: async (formKey) => formKey === "gas-turbine-log-sheet" ? [
        cloudRecord("gas-turbine-log-sheet", currentDate, { oat_memorial: 78 }, "03:00"),
        cloudRecord("gas-turbine-log-sheet", currentDate, { oat_memorial: 62 }, "07:00"),
      ] : [],
    });
    expect(result.record?.values).toMatchObject({ oat_high: 78, oat_low: 62 });
  });

  it("uses the centralized resolved values when a trend has stale cloud OAT observations", async () => {
    const projection = cloudRecord("daily-consumption-totals", currentDate, { oat_high: 99, oat_low: 1 }, null, { provenance: { status: "current" } });
    const points = await derivedTrendPoints("daily-consumption-totals", "oat_high", {
      online: true, localForm8: [], localForm9: [], cloudProjections: [projection],
      fetchTrend: async () => [{ aggregate_id: projection.aggregateId, plant_date: currentDate, measured_at: `${currentDate}T23:59:00`, numeric_value: 99 }],
      fetchSources: async (formKey) => formKey === "gas-turbine-log-sheet" ? [cloudRecord("gas-turbine-log-sheet", currentDate, { oat_memorial: 78 }, "03:00")] : [],
    });
    expect(points[0].numeric_value).toBe(78);
  });

  it("ignores local drafts and temporary edits so cloud remains eligible", async () => {
    const projection = cloudRecord("makeup", currentDate, { cw_makeup_current: 8 }, null, { provenance: { status: "current" } });
    const draft = localEntry("integrator-readings", currentDate, values({ cw_makeup: 999 }), null, { status: "draft" });
    const temporary = localEntry("integrator-readings", previousDate, values({ cw_makeup: 999 }), null, { temporaryEdit: true });
    const result = await resolveDerivedProjection("makeup", currentDate, { online: true, localForm8: [draft, temporary], localForm9: [], cloudProjection: projection });
    expect(result.origin).toBe("cloud");
    expect(result.record?.values.cw_makeup_current).toBe(8);
  });

  it("requires the exact previous calendar date and never substitutes an older record", async () => {
    const localCurrent = localEntry("integrator-readings", currentDate, values({ cw_makeup: 700 }));
    const oldCloud = cloudRecord("integrator-readings", "2026-09-04", values({ cw_makeup: 400 }));
    const result = await resolveDerivedProjection("makeup", currentDate, {
      online: true,
      localForm8: [localCurrent],
      localForm9: [],
      fetchSources: async (_formKey, date) => date === "2026-09-04" ? [oldCloud] : [],
    });
    expect(result.status).toBe("waiting");
    expect(result.record?.values.cw_makeup_used).toBeNull();
    expect(result.warnings).toContain(`Waiting for completed Form 8 on previous calendar date ${previousDate}.`);
  });

  it("does not replace a local override with a stale cloud projection when an exact dependency is unavailable", async () => {
    const stale = cloudRecord("makeup", currentDate, { cw_makeup_used: 999 }, null, { provenance: { status: "current" } });
    const result = await resolveDerivedProjection("makeup", currentDate, {
      online: true,
      localForm8: [localEntry("integrator-readings", currentDate, values({ cw_makeup: 700 }))],
      localForm9: [],
      cloudProjection: stale,
      fetchSources: async () => [],
    });
    expect(result.status).toBe("waiting");
    expect(result.origin).toBe("local");
    expect(result.record?.values.cw_makeup_used).toBeNull();
    expect(result.record?.values.cw_makeup_used).not.toBe(999);
  });

  it("merges Form 9 OAT by exact slot and calculates extrema across local plus cloud slots", async () => {
    const localForm8 = [localEntry("integrator-readings", previousDate, values()), localEntry("integrator-readings", currentDate, values({ oat_high: 999, oat_low: -999 }))];
    const localForm9 = [localEntry("gas-turbine-log-sheet", currentDate, { oat_memorial: 82 }, "11:00")];
    const remoteForm9 = [cloudRecord("gas-turbine-log-sheet", currentDate, { oat_memorial: 74 }, "03:00"), cloudRecord("gas-turbine-log-sheet", currentDate, { oat_memorial: 95 }, "11:00"), cloudRecord("gas-turbine-log-sheet", currentDate, { oat_memorial: 68 }, "19:00")];
    const result = await resolveDerivedProjection("daily-consumption-totals", currentDate, {
      online: true,
      localForm8,
      localForm9,
      fetchSources: async (formKey, date) => formKey === "gas-turbine-log-sheet" && date === currentDate ? remoteForm9 : [],
    });
    expect(result.origin).toBe("hybrid");
    expect(result.record?.values.oat_high).toBe(82);
    expect(result.record?.values.oat_low).toBe(68);
  });

  it("keeps a complete local projection when online source lookup fails", async () => {
    const result = await resolveDerivedProjection("daily-consumption-totals", currentDate, {
      online: true,
      localForm8: [localEntry("integrator-readings", previousDate, values()), localEntry("integrator-readings", currentDate, values())],
      localForm9: [],
      fetchSources: async () => { throw new Error("offline"); },
    });
    expect(result.origin).toBe("local");
    expect(result.status).toBe("current");
  });

  it("uses one canonical projection ID and refuses to persist derived entries", async () => {
    const result = await resolveDerivedProjection("makeup", currentDate, { online: false, localForm8: [localEntry("integrator-readings", previousDate, values()), localEntry("integrator-readings", currentDate, values())], localForm9: [] });
    expect(result.record?.aggregateId).toBe(canonicalRecordId("makeup", currentDate));
    await expect(saveLocalEntry(localEntry("makeup", currentDate, result.record?.values ?? {}))).rejects.toThrow("read-only");
  });

  it("builds five strictly earlier, finite, current projection points per field", async () => {
    const projections = ["2026-09-02", "2026-09-03", "2026-09-04", "2026-09-05", "2026-09-06", "2026-09-07", "2026-09-08"].map((date, index) => cloudRecord("makeup", date, { cw_makeup_current: index === 1 ? Number.NaN : index }, null, { provenance: { status: index === 5 ? "waiting" : "current" } }));
    const history = await resolveDerivedHistory("makeup", "2026-09-09", { online: true, localForm8: [], localForm9: [], cloudProjections: projections });
    expect(history.cw_makeup_current.map(point => point.plant_date)).toEqual(["2026-09-08", "2026-09-06", "2026-09-05", "2026-09-04", "2026-09-02"]);
    expect(history.cw_makeup_current.every(point => point.plant_date < "2026-09-09")).toBe(true);
    expect(history.cw_makeup_current.every(point => point.aggregate_id === canonicalRecordId("makeup", point.plant_date))).toBe(true);
  });
});
