/// <reference lib="dom" />
import { canonicalRecordId } from "../../shared/canonical";
import { deriveForm8OatExtrema } from "../../shared/form8Oat";
import { allFields, getForm } from "../../shared/forms";
import { calculateForm5And6, type PreviousMeasurement } from "../../shared/formulas";
import { nextCalendarDate, normalizeContext, shiftMeasuredAt, TIME_SLOTS } from "../../shared/safetyContract";
import type { CanonicalRecord, Values } from "../../shared/types";
import { getPublicRecord, getPublicTrend, getRecord, getTrend, listPublicRecords, listRecords } from "./api";
import { getDeviceToken } from "./device";
import { listLocalEntries, type LocalEntry } from "./offlineDb";

export type ProjectionOrigin = "local" | "hybrid" | "cloud";
export type ProjectionStatus = "current" | "waiting";
export type ProjectionSourceOrigin = "local" | "cloud";

export type EffectiveProjectionSource = {
  aggregateId: string;
  contextKey: string;
  formKey: string;
  date: string;
  timeSlot?: string | null;
  revision: number;
  localVersion?: number;
  updatedAt: string;
  createdAt: string;
  origin: ProjectionSourceOrigin;
};

export type ProjectionSource = EffectiveProjectionSource & { values: Values };

export type ResolvedDerivedProjection = {
  record: CanonicalRecord | null;
  origin: ProjectionOrigin | null;
  status: ProjectionStatus;
  warnings: string[];
  sources: EffectiveProjectionSource[];
};

export type DerivedTrendPoint = {
  aggregate_id: string;
  plant_date: string;
  measured_at: string;
  numeric_value: number;
};

export type ResolverOptions = {
  online?: boolean;
  signal?: AbortSignal;
  localForm8?: readonly LocalEntry[];
  localForm9?: readonly LocalEntry[];
  cloudProjection?: CanonicalRecord | null;
  cloudProjections?: readonly CanonicalRecord[];
  fetchProjectionList?: (formKey: string, signal?: AbortSignal) => Promise<CanonicalRecord[]>;
  fetchProjection?: (formKey: string, plantDate: string, signal?: AbortSignal) => Promise<CanonicalRecord | null>;
  fetchSources?: (formKey: string, plantDate?: string, signal?: AbortSignal) => Promise<CanonicalRecord[]>;
};

type TrendOptions = ResolverOptions & {
  fetchTrend?: (signal?: AbortSignal) => Promise<DerivedTrendPoint[]>;
};

const FORM5 = "daily-consumption-totals";
const FORM6 = "makeup";
const FORM8 = "integrator-readings";
const FORM9 = "gas-turbine-log-sheet";

function isOnline(options: { online?: boolean }) {
  return options.online ?? (typeof navigator !== "undefined" && navigator.onLine);
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException("The projection request was cancelled.", "AbortError");
}

function sourceContextKey(formKey: string, date: string, timeSlot?: string | null) {
  return normalizeContext(formKey, { date, timeSlot: timeSlot ?? null });
}

function sourceFromLocal(entry: LocalEntry): ProjectionSource | null {
  if (entry.status !== "completed" || entry.temporaryEdit) return null;
  try {
    const contextKey = normalizeContext(entry.formKey, entry.context);
    return {
      aggregateId: entry.entryId,
      contextKey,
      formKey: entry.formKey,
      date: entry.context.date,
      timeSlot: entry.context.timeSlot ?? null,
      revision: entry.baseRevision ?? entry.localVersion,
      localVersion: entry.localVersion,
      updatedAt: entry.updatedAt,
      createdAt: entry.createdAt,
      origin: "local",
      values: structuredClone(entry.values),
    };
  } catch {
    return null;
  }
}

function sourceFromCloud(record: CanonicalRecord): ProjectionSource | null {
  if (record.lifecycle !== "completed") return null;
  try {
    const contextKey = normalizeContext(record.formKey, {
      date: record.date,
      shift: record.shift as "Day" | "Night" | "Extra" | null,
      timeSlot: record.timeSlot,
      boilerNumber: record.boilerNumber as 2 | 3 | 4 | null,
    });
    return {
      aggregateId: record.aggregateId,
      contextKey,
      formKey: record.formKey,
      date: record.date,
      timeSlot: record.timeSlot,
      revision: record.revision,
      updatedAt: record.updatedAt,
      createdAt: record.createdAt,
      origin: "cloud",
      values: structuredClone(record.values),
    };
  } catch {
    return null;
  }
}

function newest(sources: ProjectionSource[]) {
  return [...sources].sort((a, b) => b.revision - a.revision || b.updatedAt.localeCompare(a.updatedAt) || a.aggregateId.localeCompare(b.aggregateId))[0] ?? null;
}

const BOILER_DELTA_FIELDS = ["gas_boiler3", "steam_boiler3", "gas_boiler4", "steam_boiler4"] as const;
type BoilerDeltaField = typeof BOILER_DELTA_FIELDS[number];

function latestMeasurement(sources: readonly ProjectionSource[], field: BoilerDeltaField) {
  for (const source of [...sources].sort((a, b) => b.date.localeCompare(a.date) || b.revision - a.revision || b.updatedAt.localeCompare(a.updatedAt))) {
    const value = source.values[field];
    if (typeof value === "number" && Number.isFinite(value)) return { source, measurement: { value, date: source.date } satisfies PreviousMeasurement };
  }
  return null;
}

function latestNumericValue(sources: readonly ProjectionSource[], field: string) {
  for (const source of [...sources].sort((a, b) => b.date.localeCompare(a.date) || b.revision - a.revision || b.updatedAt.localeCompare(a.updatedAt))) {
    const value = source.values[field];
    if (typeof value === "number" && Number.isFinite(value)) return { source, value };
  }
  return null;
}

function dedupe(sources: ProjectionSource[]) {
  const byContext = new Map<string, ProjectionSource>();
  for (const source of sources) {
    const current = byContext.get(source.contextKey);
    if (!current || source.origin === "local" && current.origin !== "local" || source.origin === current.origin && newest([current, source]) === source) {
      byContext.set(source.contextKey, source);
    }
  }
  return [...byContext.values()];
}

/** Selects one exact source context, always preferring an eligible local record. */
export function selectExactSource(local: readonly ProjectionSource[], remote: readonly ProjectionSource[], contextKey: string) {
  return newest(local.filter(source => source.contextKey === contextKey)) ?? newest(remote.filter(source => source.contextKey === contextKey));
}

/** Merges sources by exact normalized context; local never loses to cloud for the same context. */
export function mergeSourcesByContext(local: readonly ProjectionSource[], remote: readonly ProjectionSource[]) {
  return dedupe([...remote, ...local]);
}

function eligibleCloud(records: readonly CanonicalRecord[], formKey: string, date: string, timeSlot?: string | null) {
  if (formKey === FORM9 && !timeSlot) return records.map(sourceFromCloud).filter((source): source is ProjectionSource => Boolean(source && source.formKey === formKey && source.date === date && source.timeSlot));
  const expected = sourceContextKey(formKey, date, timeSlot);
  return records.map(sourceFromCloud).filter((source): source is ProjectionSource => Boolean(source && source.formKey === formKey && source.date === date && source.contextKey === expected));
}

function sourceSummary(source: ProjectionSource): EffectiveProjectionSource {
  const { values: _values, ...summary } = source;
  return summary;
}

function originFor(sources: readonly ProjectionSource[]): ProjectionOrigin {
  const hasLocal = sources.some(source => source.origin === "local");
  const hasCloud = sources.some(source => source.origin === "cloud");
  return hasLocal && hasCloud ? "hybrid" : hasLocal ? "local" : "cloud";
}

function projectionRecordFromCalculation(formKey: string, plantDate: string, values: Values, status: ProjectionStatus, warnings: string[], sources: readonly ProjectionSource[]): CanonicalRecord {
  const ordered = [...sources].sort((a, b) => a.updatedAt.localeCompare(b.updatedAt) || a.aggregateId.localeCompare(b.aggregateId));
  const createdAt = ordered[0]?.createdAt ?? ordered[0]?.updatedAt ?? "1970-01-01T00:00:00.000Z";
  const updatedAt = ordered.at(-1)?.updatedAt ?? createdAt;
  const origin = originFor(sources);
  return {
    aggregateId: canonicalRecordId(formKey, plantDate),
    formKey,
    contextKey: plantDate,
    revision: 0,
    publishedRevision: null,
    lifecycle: status === "current" ? "completed" : "draft",
    operatorId: null,
    operator: "System",
    date: plantDate,
    shift: null,
    timeSlot: null,
    boilerNumber: null,
    values: structuredClone(values),
    createdAt,
    updatedAt,
    provenance: {
      source: "local-first-projection",
      origin,
      status,
      warnings: [...warnings],
      sourceContexts: sources.map(sourceSummary),
    },
  };
}

function resolvedFromCloud(record: CanonicalRecord): ResolvedDerivedProjection {
  const provenance = record.provenance ?? {};
  const rawStatus = provenance.status;
  const status: ProjectionStatus = rawStatus === "current" && record.lifecycle === "completed" ? "current" : "waiting";
  const warnings = Array.isArray(provenance.warnings) ? provenance.warnings.filter((warning): warning is string => typeof warning === "string") : [];
  return {
    record: { ...record, provenance: { ...provenance, source: "local-first-projection", origin: "cloud", status, warnings } },
    origin: "cloud",
    status,
    warnings,
    sources: [],
  };
}

function withResolvedOat(record: CanonicalRecord, oatSources: readonly ProjectionSource[]): ResolvedDerivedProjection {
  const oat = deriveForm8OatExtrema(oatSources.map(source => ({ date: source.date, timeSlot: source.timeSlot, values: source.values, status: "completed", lifecycle: "completed" })), record.date, "oat_memorial");
  const provenance = record.provenance ?? {};
  const warnings = Array.isArray(provenance.warnings) ? provenance.warnings.filter((warning): warning is string => typeof warning === "string") : [];
  const status: ProjectionStatus = provenance.status === "current" && record.lifecycle === "completed" ? "current" : "waiting";
  return {
    record: { ...record, values: { ...record.values, oat_high: oat.values.oat_high ?? null, oat_low: oat.values.oat_low ?? null }, provenance: { ...provenance, source: "local-first-projection", origin: "cloud", status, warnings, sourceContexts: oatSources.map(sourceSummary) } },
    origin: "cloud",
    status,
    warnings,
    sources: oatSources.map(sourceSummary),
  };
}

async function defaultFetchProjection(formKey: string, plantDate: string, signal?: AbortSignal) {
  const id = canonicalRecordId(formKey, plantDate);
  const authenticated = Boolean(getDeviceToken());
  try {
    if (authenticated) return (await getRecord(id, signal)).current;
    return (await getPublicRecord(id, signal)).record;
  } catch (error) {
    if (error && typeof error === "object" && "status" in error && (error as { status: number }).status === 404) return null;
    throw error;
  }
}

async function defaultFetchSources(formKey: string, plantDate?: string, signal?: AbortSignal) {
  const result = getDeviceToken() ? await listRecords(formKey, plantDate, signal) : await listPublicRecords(formKey, plantDate, signal);
  return result.records;
}

async function localInputs(options: ResolverOptions) {
  const [localForm8, localForm9] = await Promise.all([
    options.localForm8 ? Promise.resolve(options.localForm8) : listLocalEntries(FORM8),
    options.localForm9 ? Promise.resolve(options.localForm9) : listLocalEntries(FORM9),
  ]);
  return { localForm8, localForm9 };
}

export async function resolveDerivedProjection(formKey: string, plantDate: string, options: ResolverOptions = {}): Promise<ResolvedDerivedProjection> {
  if (formKey !== FORM5 && formKey !== FORM6) throw new Error(`Unsupported derived form: ${formKey}`);
  throwIfAborted(options.signal);
  const online = isOnline(options);
  const { localForm8, localForm9 } = await localInputs(options);
  const localForm8Sources = localForm8.map(sourceFromLocal).filter((source): source is ProjectionSource => Boolean(source && source.formKey === FORM8));
  const localOat = formKey === FORM5
    ? localForm9.map(sourceFromLocal).filter((source): source is ProjectionSource => Boolean(source && source.formKey === FORM9 && source.date === plantDate && source.timeSlot))
    : [];
  const hasLocalOverride = localForm8Sources.length > 0 || localOat.length > 0;
  const fetchProjection = options.fetchProjection ?? defaultFetchProjection;
  const fetchSources = options.fetchSources ?? defaultFetchSources;
  const hasProvidedProjection = Object.prototype.hasOwnProperty.call(options, "cloudProjection");

  if (online && !hasLocalOverride) {
    let cloudProjection = hasProvidedProjection ? options.cloudProjection ?? null : null;
    if (!hasProvidedProjection) {
      try {
        cloudProjection = await fetchProjection(formKey, plantDate, options.signal);
      } catch (error) {
        throwIfAborted(options.signal);
        cloudProjection = null;
      }
    }
    if (cloudProjection) {
      if (formKey !== FORM5) return resolvedFromCloud(cloudProjection);
      let remoteOat: CanonicalRecord[] = [];
      try { remoteOat = await fetchSources(FORM9, plantDate, options.signal); } catch (error) { throwIfAborted(options.signal); }
      const oatSources = eligibleCloud(remoteOat, FORM9, plantDate);
      return oatSources.length ? withResolvedOat(cloudProjection, oatSources) : resolvedFromCloud(cloudProjection);
    }
  }

  let remoteForm8: CanonicalRecord[] = [];
  let remoteOat: CanonicalRecord[] = [];
  if (online) {
    const requests: Array<Promise<void>> = [];
    requests.push(fetchSources(FORM8, undefined, options.signal).then(records => { remoteForm8 = records; }).catch(error => { throwIfAborted(options.signal); }));
    if (formKey === FORM5) requests.push(fetchSources(FORM9, plantDate, options.signal).then(records => { remoteOat = records; }).catch(error => { throwIfAborted(options.signal); }));
    await Promise.all(requests);
  }

  const remoteForm8Sources = remoteForm8.map(sourceFromCloud).filter((source): source is ProjectionSource => Boolean(source && source.formKey === FORM8));
  const form8Sources = dedupe([...remoteForm8Sources, ...localForm8Sources]);
  const current = newest(form8Sources.filter(source => source.date === plantDate));
  const priorSources = form8Sources.filter(source => source.date < plantDate).sort((a, b) => b.date.localeCompare(a.date) || b.revision - a.revision || b.updatedAt.localeCompare(a.updatedAt));
  const previous = priorSources[0] ?? null;
  const previousValues: Values = {};
  for (const field of ["hotwell_makeup", "cw_makeup"] as const) {
    const selected = latestNumericValue(priorSources, field);
    if (selected) previousValues[field] = selected.value;
  }
  const previousMeasurements: Partial<Record<BoilerDeltaField, PreviousMeasurement>> = {};
  const selectedPriorSources = new Map<string, ProjectionSource>();
  for (const field of BOILER_DELTA_FIELDS) {
    const selected = latestMeasurement(priorSources, field);
    if (!selected) continue;
    previousMeasurements[field] = selected.measurement;
    selectedPriorSources.set(`${selected.source.aggregateId}@${selected.source.revision}`, selected.source);
  }
  if (previous) selectedPriorSources.set(`${previous.aggregateId}@${previous.revision}`, previous);
  const oatSources = mergeSourcesByContext(localOat, eligibleCloud(remoteOat, FORM9, plantDate));
  const effectiveSources = [current, ...selectedPriorSources.values(), ...oatSources].filter((source): source is ProjectionSource => Boolean(source));
  if (!effectiveSources.length) return { record: null, origin: null, status: "waiting", warnings: [], sources: [] };

  const calculated = calculateForm5And6({
    currentValues: current?.values ?? {},
    previousValues,
    currentDate: plantDate,
    previousDate: previous?.date ?? nextCalendarDate(plantDate, -1),
    hasCurrent: Boolean(current),
    hasPrevious: priorSources.length > 0,
    previousMeasurements,
  });
  const values = formKey === FORM5 ? calculated.form5 : calculated.form6;
  if (formKey === FORM5) {
    const oat = deriveForm8OatExtrema(oatSources.map(source => ({ date: source.date, timeSlot: source.timeSlot, values: source.values, status: "completed", lifecycle: "completed" })), plantDate, "oat_memorial");
    values.oat_high = oat.values.oat_high ?? null;
    values.oat_low = oat.values.oat_low ?? null;
  }
  const status: ProjectionStatus = calculated.status === "current" ? "current" : "waiting";
  const record = projectionRecordFromCalculation(formKey, plantDate, values, status, calculated.warnings, effectiveSources);
  return { record, origin: originFor(effectiveSources), status, warnings: calculated.warnings, sources: effectiveSources.map(sourceSummary) };
}

function projectionDateFromId(formKey: string, projectionId: string) {
  const formNumber = formKey === FORM5 ? 5 : formKey === FORM6 ? 6 : 0;
  const match = formNumber ? projectionId.match(new RegExp(`^F${String(formNumber).padStart(2, "0")}-(\\d{4}-\\d{2}-\\d{2})$`)) : null;
  const date = match?.[1];
  return date && canonicalRecordId(formKey, date) === projectionId ? date : null;
}

export function getDerivedProjectionDate(formKey: string, projectionId: string) {
  return projectionDateFromId(formKey, projectionId);
}

export function projectionOriginLabel(origin: ProjectionOrigin | null, status: ProjectionStatus) {
  if (status === "waiting") return "Waiting for exact source records";
  return origin === "local" ? "Local projection" : origin === "hybrid" ? "Local + server sources" : "Server projection";
}

function candidateDates(entries: readonly LocalEntry[]) {
  const dates = new Set<string>();
  for (const entry of entries) {
    if (entry.status !== "completed" || entry.temporaryEdit) continue;
    dates.add(entry.context.date);
    dates.add(nextCalendarDate(entry.context.date, 1));
  }
  return dates;
}

function cloudProjectionResult(record: CanonicalRecord): ResolvedDerivedProjection {
  return resolvedFromCloud(record);
}

export async function listResolvedDerivedProjections(formKey: string, options: ResolverOptions = {}) {
  if (formKey !== FORM5 && formKey !== FORM6) throw new Error(`Unsupported derived form: ${formKey}`);
  const { localForm8, localForm9 } = await localInputs(options);
  const online = isOnline(options);
  let cloudRecords: CanonicalRecord[] = [];
  if (online) {
    try {
      if (options.cloudProjections) cloudRecords = [...options.cloudProjections];
      else if (options.fetchProjectionList) cloudRecords = await options.fetchProjectionList(formKey, options.signal);
      else {
        const result = getDeviceToken() ? await listRecords(formKey, undefined, options.signal) : await listPublicRecords(formKey, undefined, options.signal);
        cloudRecords = result.records;
      }
    } catch (error) {
      throwIfAborted(options.signal);
    }
  }
  const dates = candidateDates(localForm8);
  for (const record of cloudRecords) dates.add(record.date);
  const cloudByDate = new Map(cloudRecords.map(record => [record.date, record]));
  const resolved: ResolvedDerivedProjection[] = [];
  for (const date of [...dates].sort((a, b) => b.localeCompare(a))) {
    const result = await resolveDerivedProjection(formKey, date, {
      ...options,
      online,
      localForm8,
      localForm9,
      cloudProjection: cloudByDate.get(date) ?? null,
    });
    if (result.record) resolved.push(result);
  }
  return resolved;
}

export type DerivedHistoryMap = Record<string, DerivedTrendPoint[]>;

/** Resolves calculated projection history relative to the selected date. */
export async function resolveDerivedHistory(formKey: string, beforeDate: string, options: ResolverOptions = {}): Promise<DerivedHistoryMap> {
  if (formKey !== FORM5 && formKey !== FORM6) throw new Error(`Unsupported derived form: ${formKey}`);
  throwIfAborted(options.signal);
  const form = getForm(formKey)!;
  const fields = allFields(form).filter(field => field.trendable && (field.type === "number" || field.type === "computed")).map(field => field.key);
  const resolved = await listResolvedDerivedProjections(formKey, options);
  const history: DerivedHistoryMap = Object.fromEntries(fields.map(field => [field, []]));
  const seen = new Map<string, Set<string>>();
  for (const field of fields) seen.set(field, new Set());
  for (const result of resolved) {
    const record = result.record;
    if (!record || result.status !== "current" || record.date >= beforeDate) continue;
    const point = { aggregate_id: canonicalRecordId(formKey, record.date), plant_date: record.date, measured_at: `${record.date}T23:59:00`, numeric_value: 0 };
    for (const field of fields) {
      const value = record.values[field];
      if (typeof value !== "number" || !Number.isFinite(value)) continue;
      const key = point.aggregate_id;
      if (seen.get(field)!.has(key)) continue;
      seen.get(field)!.add(key);
      history[field].push({ ...point, numeric_value: value });
    }
  }
  for (const points of Object.values(history)) points.sort((a, b) => b.measured_at.localeCompare(a.measured_at));
  for (const field of fields) history[field] = history[field].slice(0, 5);
  return history;
}

export async function derivedTrendPoints(formKey: string, fieldKey: string, options: TrendOptions = {}) {
  if (formKey !== FORM5 && formKey !== FORM6) throw new Error(`Unsupported derived form: ${formKey}`);
  const { localForm8, localForm9 } = await localInputs(options);
  const online = isOnline(options);
  let remotePoints: DerivedTrendPoint[] = [];
  let remoteError: unknown = null;
  if (online) {
    try {
      const fetchTrend = options.fetchTrend ?? (async (signal?: AbortSignal) => {
        const result = Boolean(getDeviceToken())
          ? await getTrend(formKey, fieldKey, 365, signal)
          : await getPublicTrend(formKey, fieldKey, 365, signal);
        return result.points;
      });
      remotePoints = await fetchTrend(options.signal);
    } catch (error) {
      throwIfAborted(options.signal);
      remoteError = error;
    }
  }
  const localDates = [...candidateDates(localForm8)].sort((a, b) => b.localeCompare(a));
  const localPoints: DerivedTrendPoint[] = [];
  for (const date of localDates) {
    const result = await resolveDerivedProjection(formKey, date, { ...options, online, localForm8, localForm9, cloudProjection: null });
    const value = result.record?.values[fieldKey];
    if (result.record && typeof value === "number" && Number.isFinite(value)) localPoints.push({ aggregate_id: result.record.aggregateId, plant_date: date, measured_at: `${date}T23:59:00`, numeric_value: value });
  }
  let resolvedPoints: DerivedTrendPoint[] = [];
  if (online) {
    try {
      const projections = await listResolvedDerivedProjections(formKey, { ...options, online, localForm8, localForm9 });
      resolvedPoints = projections.flatMap(result => {
        if (!result.record || result.status !== "current") return [];
        const value = result.record.values[fieldKey];
        return typeof value === "number" && Number.isFinite(value) ? [{ aggregate_id: result.record.aggregateId, plant_date: result.record.date, measured_at: `${result.record.date}T23:59:00`, numeric_value: value }] : [];
      });
    } catch (error) {
      throwIfAborted(options.signal);
    }
  }
  if (remoteError && !localPoints.length && !resolvedPoints.length) throw remoteError;
  const merged = new Map(remotePoints.map(point => [point.aggregate_id, point]));
  for (const point of resolvedPoints) merged.set(point.aggregate_id, point);
  for (const point of localPoints) merged.set(point.aggregate_id, point);
  return [...merged.values()].sort((a, b) => b.measured_at.localeCompare(a.measured_at)).slice(0, 365);
}

export function localTrendPoint(entry: LocalEntry, fieldKey: string): DerivedTrendPoint | null {
  const value = entry.values[fieldKey];
  if (entry.status !== "completed" || entry.temporaryEdit || typeof value !== "number" || !Number.isFinite(value)) return null;
  return { aggregate_id: entry.entryId, plant_date: entry.context.date, measured_at: entry.context.timeSlot ? `${entry.context.date}T${entry.context.timeSlot}:00` : shiftMeasuredAt(entry.context.date, entry.context.shift), numeric_value: value };
}

export { FORM5, FORM6, FORM8, FORM9, TIME_SLOTS };
