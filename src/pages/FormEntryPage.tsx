import { ArrowLeft, Check, CircleAlert, CloudOff, Pencil, Save, ShieldCheck, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { AiCapture } from "../components/AiCapture";
import { FormRenderer, type HistoryMap } from "../components/FormRenderer";
import { allFields, getForm } from "../forms";
import { getHistoryBatch, getRecord, listRecords } from "../lib/api";
import { todayPlantDate } from "../lib/format";
import { resolveForm2DailyTotals } from "../lib/form2DailyTotals";
import { FORM8_OAT_EXTREME_KEYS, resolveForm8OatExtrema } from "../lib/form8OatExtrema";
import { calculateForm5And6, calculateOhAlk } from "../../shared/formulas";
import { deriveForm8OatExtrema } from "../../shared/form8Oat";
import { nextCalendarDate, normalizeContext, SHIFT_OPTIONS, shiftMeasuredAt } from "../../shared/safetyContract";
import { FORM2_DAILY_TOTAL_KEYS } from "../../shared/form2DailyTotals";
import { discardTemporaryEdit, DuplicateContextError, enqueueCompleted, findLocalEntry, getOperators, listLocalEntries, loadLocalEntry, localEntryFromRecord, newLocalEntry, replaceLocalEntry, saveLocalEntry, type LocalEntry } from "../lib/offlineDb";
import { onUpdateCheckpointRequest, setEditActive } from "../lib/pwaUpdateCoordinator";
import type { CanonicalRecord, FieldValue } from "../types";
import { BOILERS, TIME_SLOTS } from "../types";
type HistoryPoint = HistoryMap[string][number];
function localMeasuredAt(entry: LocalEntry) {
  if (entry.context.timeSlot) return `${entry.context.date}T${entry.context.timeSlot}:00`;
  return shiftMeasuredAt(entry.context.date, entry.context.shift);
}
function localHistoryFor(form: NonNullable<ReturnType<typeof getForm>>, entries: LocalEntry[]): HistoryMap {
  const numericKeys = new Set(allFields(form).filter(field => field.trendable && (field.type === "number" || field.type === "computed")).map(field => field.key));
  const pairedFields = allFields(form).filter(field => field.type === "paired-number");
  const history: HistoryMap = {};
  for (const entry of entries) {
    if (entry.formKey !== form.key || entry.status !== "completed" || entry.temporaryEdit) continue;
    for (const fieldKey of numericKeys) {
      const value = entry.values[fieldKey];
      if (typeof value !== "number" || !Number.isFinite(value)) continue;
      (history[fieldKey] ??= []).push({
        aggregate_id: entry.entryId,
        plant_date: entry.context.date,
        measured_at: localMeasuredAt(entry),
        numeric_value: value
      });
    }
    for (const field of pairedFields) {
      const value = entry.values[field.key];
      if (typeof value !== "object" || value === null) continue;
      if (typeof value.first !== "number" || !Number.isFinite(value.first) || typeof value.second !== "number" || !Number.isFinite(value.second)) continue;
      for (const component of ["first", "second"] as const) {
        const componentValue = value[component];
        if (typeof componentValue !== "number" || !Number.isFinite(componentValue)) continue;
        const historyKey = `${field.key}:${component}`;
        (history[historyKey] ??= []).push({
          aggregate_id: entry.entryId,
          plant_date: entry.context.date,
          measured_at: localMeasuredAt(entry),
          numeric_value: componentValue
        });
      }
    }
  }
  for (const points of Object.values(history)) points.sort((a, b) => b.measured_at.localeCompare(a.measured_at));
  return history;
}
function mergeHistory(...sources: HistoryMap[]): HistoryMap {
  const merged: Record<string, Map<string, HistoryPoint>> = {};
  for (const source of sources) {
    for (const [fieldKey, points] of Object.entries(source)) {
      const field = merged[fieldKey] ??= new Map();
      for (const point of points) field.set(`${point.aggregate_id}-${point.measured_at}`, point);
    }
  }
  return Object.fromEntries(Object.entries(merged).map(([fieldKey, points]) => [fieldKey, [...points.values()].sort((a, b) => b.measured_at.localeCompare(a.measured_at)).slice(0, 5)]));
}
function contextError(entry: LocalEntry) {
  const form = getForm(entry.formKey)!;
  if (!entry.operator) return "Select an operator.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.context.date)) return "Select a valid date.";
  if (form.hasShift && !entry.context.shift) return "Select Day, Night, or Extra shift.";
  if (form.hasTimeSlot && !entry.context.timeSlot) return "Select a time slot.";
  if (form.hasBoiler && !entry.context.boilerNumber) return "Select Boiler 2, 3, or 4.";
  return null;
}
function draftContextDetails(form: {
  hasShift?: boolean;
  hasTimeSlot?: boolean;
  hasBoiler?: boolean;
}, entry: LocalEntry) {
  const details: string[] = [];
  if (form.hasShift) details.push(entry.context.shift ?? "Shift not selected");
  if (form.hasTimeSlot) details.push(entry.context.timeSlot ?? "Time not selected");
  if (form.hasBoiler) details.push(entry.context.boilerNumber ? `Boiler ${entry.context.boilerNumber}` : "Boiler not selected");
  return details.join(" · ");
}
function isDuplicateSelectionError(error: unknown): error is DuplicateContextError {
  return error instanceof DuplicateContextError || error instanceof Error && error.message.includes("normalized context already has a local entry");
}
function validPlantDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}
function missingMetadata(form: NonNullable<ReturnType<typeof getForm>>, entry: LocalEntry) {
  const missing: string[] = [];
  if (!entry.operator) missing.push("operator");
  if (!validPlantDate(entry.context.date)) missing.push("a valid plant date");
  if (form.hasShift && !entry.context.shift) missing.push("shift");
  if (form.hasTimeSlot && !entry.context.timeSlot) missing.push("time slot");
  if (form.hasBoiler && !entry.context.boilerNumber) missing.push("boiler");
  return missing;
}
function DerivedFormPage({
  formKey
}: {
  formKey: string;
}) {
  const form = getForm(formKey)!;
  const [date, setDate] = useState(todayPlantDate());
  const [record, setRecord] = useState<CanonicalRecord | null>(null);
  const [history, setHistory] = useState<HistoryMap>({});
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  async function load() {
    setBusy(true);
    setMessage(null);
    try {
      // Form 5/6 are local projections. A server response or an older cached
      // projection must never become an input to the calculation.
      const [entries, form9Entries] = await Promise.all([
        listLocalEntries("integrator-readings"),
        listLocalEntries("gas-turbine-log-sheet")
      ]);
      const current = entries.find(x => x.context.date === date && x.status === "completed" && !x.temporaryEdit);
      const previousDate = nextCalendarDate(date, -1);
      const previous = entries.find(x => x.context.date === previousDate && x.status === "completed" && !x.temporaryEdit);
      if (!current && !previous) {
        setRecord(null);
        setHistory({});
        return;
      }
      const oatExtrema = deriveForm8OatExtrema(
        form9Entries.map(entry => ({
          date: entry.context.date,
          timeSlot: entry.context.timeSlot,
          values: entry.values,
          status: entry.status,
          temporaryEdit: entry.temporaryEdit
        })),
        date,
        "oat_memorial"
      );
      const calculated = calculateForm5And6({
        currentValues: current?.values ?? {},
        previousValues: previous?.values ?? {},
        currentDate: date,
        previousDate,
        hasCurrent: Boolean(current),
        hasPrevious: Boolean(previous)
      });
      const values = formKey === "daily-consumption-totals" ? calculated.form5 : calculated.form6;
      if (formKey === "daily-consumption-totals") {
        values.oat_high = oatExtrema.values.oat_high ?? null;
        values.oat_low = oatExtrema.values.oat_low ?? null;
      }
      setRecord({
        aggregateId: `local-projection-${formKey}-${date}`,
        formKey,
        contextKey: date,
        revision: 0,
        publishedRevision: 0,
        lifecycle: "completed",
        operatorId: null,
        operator: "System",
        date,
        shift: null,
        timeSlot: null,
        boilerNumber: null,
        values,
        createdAt: current?.createdAt ?? previous?.createdAt ?? new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        provenance: {
          status: calculated.status,
          warnings: calculated.warnings,
          source: "local-form8-and-form9"
        }
      });
      setHistory({});
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    void load();
  }, [date, formKey]);
  return <div className="page-stack"><div className="form-page-header"><div><Link className="back-link" to="/"><ArrowLeft size={16} /> Back to forms</Link><div className="eyebrow">Form {form.number} · read-only local projection</div><h1>{form.name}</h1><p>{form.description}</p></div></div><div className="metadata-panel"><label className="metadata-field"><span>Plant date</span><input type="date" value={date} onChange={e => setDate(e.target.value)} /></label><div className="metadata-field"><span>Projection status</span><div className={`notice ${(record?.provenance as any)?.status === "current" ? "" : "warning"}`}><ShieldCheck size={17} /> {(record?.provenance as any)?.status ?? "waiting"}</div></div></div>{message && <div className="notice warning"><CircleAlert size={18} />{message}</div>}{!record ? <div className="empty-state"><h2>{busy ? "Loading…" : "Waiting"}</h2><p>Exact completed Form 8 source dates are required. No server or cached projection is used.</p></div> : <><FormRenderer form={form} values={record.values} history={history} disabled onChange={() => undefined} onTrend={key => navigate(`/trends/${formKey}/${key}`)} /><div className="safety-status-banner"><ShieldCheck size={18} /><div><strong>Read-only projection</strong><span>Form 5 and Form 6 are calculated locally from exact completed Form 8 dates. Negative deltas are retained and flagged for review.</span></div></div></>}</div>;
}
export function FormEntryPage() {
  const {
    formKey = "",
    aggregateId
  } = useParams();
  const navigate = useNavigate();
  const form = getForm(formKey);
  const [entry, setEntry] = useState<LocalEntry | null>(null);
  const entryRef = useRef<LocalEntry | null>(null);
  const saveChain = useRef<Promise<void>>(Promise.resolve());
  const [operators, setOperators] = useState<Awaited<ReturnType<typeof getOperators>>>([]);
  const [history, setHistory] = useState<HistoryMap>({});
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [completionBanner, setCompletionBanner] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [completeLocked, setCompleteLocked] = useState(false);
  const completeLockTimer = useRef<number | null>(null);
  const [duplicate, setDuplicate] = useState<LocalEntry | null>(null);
  const dismissedDuplicateContext = useRef<string | null>(null);
  const [editBaseline, setEditBaseline] = useState<LocalEntry | null>(null);
  const editBaselineRef = useRef<LocalEntry | null>(null);
  const finalizedEdit = useRef(false);
  const [availableDrafts, setAvailableDrafts] = useState<LocalEntry[] | null>(null);
  const [isNewEntry, setIsNewEntry] = useState(false);
  const [form2Totals, setForm2Totals] = useState<Awaited<ReturnType<typeof resolveForm2DailyTotals>>>({
    sourceDate: null,
    status: "hidden",
    values: { oat_high: null, oat_low: null }
  });
  const [form8OatExtremes, setForm8OatExtremes] = useState<Awaited<ReturnType<typeof resolveForm8OatExtrema>>>({
    sourceDate: "",
    status: "hidden",
    values: {}
  });
  const toastTimer = useRef<number | null>(null);
  const aiFields = useMemo(() => form ? allFields(form).filter(f => f.aiExtract) : [], [form]);
  useEffect(() => {
    void getOperators().then(setOperators);
  }, []);
  useEffect(() => onUpdateCheckpointRequest(async () => {
    await saveChain.current;
    if (entryRef.current?.storageError) throw new Error(entryRef.current.storageError);
  }), []);
  useEffect(() => {
    if (!form || form.schedule === "derived") return;
    let cancelled = false;
    setLoading(true);
    setEntry(null);
    entryRef.current = null;
    setIsNewEntry(false);
    setAvailableDrafts(null);
    setMessage(null);
    setDuplicate(null);
    dismissedDuplicateContext.current = null;
    setCompletionBanner(null);
    setSavedAt(null);
    setEditBaseline(null);
    editBaselineRef.current = null;
    finalizedEdit.current = false;
    void (async () => {
      try {
        const plantDate = todayPlantDate();
        let loaded = aggregateId ? await loadLocalEntry(aggregateId) : undefined;
        if (!loaded && aggregateId && navigator.onLine) {
          try {
            const remote = await getRecord(aggregateId);
            loaded = await saveLocalEntry(localEntryFromRecord(remote.current));
          } catch {/* A local-only record may not be reachable while offline. */}
        }
        const h = await getHistoryBatch(formKey).catch(() => ({
          history: {}
        }));
        if (!loaded && !aggregateId) {
          const drafts = await listLocalEntries(formKey);
          const matching = drafts.filter(candidate => candidate.status === "draft" && candidate.context.date === plantDate);
          if (form.hasShift || form.hasTimeSlot || form.hasBoiler) {
            if (matching.length) {
              if (!cancelled) {
                setAvailableDrafts(matching);
                setHistory(h.history);
              }
              return;
            }
          } else if (matching[0]) loaded = matching[0];
        }
        if (!loaded) {
          loaded = newLocalEntry(formKey, plantDate);
          setIsNewEntry(true);
        }
        if (cancelled) return;
        entryRef.current = loaded;
        setEntry(loaded);
        setCompletionBanner(loaded.status === "completed" ? "This completed record is saved on this tablet. Cloud upload continues in the background." : null);
        setSavedAt(loaded.updatedAt);
        if (!cancelled) setHistory(h.history);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      setEditActive(false);
      const baseline = editBaselineRef.current;
      const current = entryRef.current;
      if (baseline && !finalizedEdit.current) void (async () => {
        try {
          await saveChain.current;
          await discardTemporaryEdit(baseline, current?.localVersion);
        } catch {/* Preserve the already durable baseline if cleanup cannot write. */}
      })();
    };
  }, [aggregateId, formKey, form]);
  // Previous measurements are local-first too. The cloud history request can
  // be unavailable while offline or can lag behind a completed local entry,
  // so merge completed local values into whatever the server returned.
  useEffect(() => {
    if (!form || form.schedule === "derived") return;
    let cancelled = false;
    void listLocalEntries(formKey).then(entries => {
      if (cancelled) return;
      const local = localHistoryFor(form, entries);
      setHistory(current => {
        const merged = mergeHistory(current, local);
        return JSON.stringify(current) === JSON.stringify(merged) ? current : merged;
      });
    });
    return () => {
      cancelled = true;
    };
  }, [entry?.updatedAt, form, formKey, history]);
  useEffect(() => {
    setEditActive(Boolean(entry && (!aggregateId || entry.status === "draft" || entry.temporaryEdit)));
    return () => setEditActive(false);
  }, [entry, aggregateId]);
  useEffect(() => {
    if (formKey !== "boiler-water-control-tests" || !entry) {
      setForm2Totals({ sourceDate: null, status: "hidden", values: {} });
      return;
    }
    let cancelled = false;
    const refresh = () => void resolveForm2DailyTotals(entry.context).then(totals => {
      if (!cancelled) setForm2Totals(totals);
    });
    refresh();
    window.addEventListener("ecc-local-change", refresh);
    return () => {
      cancelled = true;
      window.removeEventListener("ecc-local-change", refresh);
    };
  }, [entry?.context.date, entry?.context.shift, formKey]);
  useEffect(() => {
    if (formKey !== "integrator-readings" || !entry) {
      setForm8OatExtremes({ sourceDate: "", status: "hidden", values: { oat_high: null, oat_low: null } });
      return;
    }
    let cancelled = false;
    const refresh = () => void resolveForm8OatExtrema(entry.context).then(extremes => {
      if (!cancelled) setForm8OatExtremes(extremes);
    });
    refresh();
    window.addEventListener("ecc-local-change", refresh);
    return () => {
      cancelled = true;
      window.removeEventListener("ecc-local-change", refresh);
    };
  }, [entry?.context.date, formKey]);
  useEffect(() => () => {
    if (completeLockTimer.current != null) window.clearTimeout(completeLockTimer.current);
    if (toastTimer.current != null) window.clearTimeout(toastTimer.current);
  }, []);
  useEffect(() => {
    if (aggregateId || !entry) return;
    let key: string | null;
    try {
      key = normalizeContext(formKey, entry.context);
    } catch {
      return;
    }
    if (dismissedDuplicateContext.current && dismissedDuplicateContext.current !== key) dismissedDuplicateContext.current = null;
    if (dismissedDuplicateContext.current === key) return;
    let active = true;
    void (async () => {
      let found = await findLocalEntry(formKey, key);
      // A completed record may belong to another tablet and therefore not be
      // in IndexedDB yet. Check the canonical store before allowing a second
      // entry for the same normalized context.
      if (!found && navigator.onLine) {
        try {
          const remote = await listRecords(formKey, entry.context.date);
          const matching = remote.records.find(record => record.contextKey === key);
          if (matching) found = localEntryFromRecord(matching);
        } catch {
          // The local guard still works offline; the Worker remains the
          // authoritative final guard until it can be reached again.
        }
      }
      const current = entryRef.current;
      let currentKey: string | null = null;
      try {
        if (current) currentKey = normalizeContext(formKey, current.context);
      } catch {/* incomplete context cannot match */}
      if (active && found && found.entryId !== entry.entryId && currentKey === key && dismissedDuplicateContext.current !== key) setDuplicate(found);
    })();
    return () => {
      active = false;
    };
  }, [entry?.context.date, entry?.context.shift, entry?.context.timeSlot, entry?.context.boilerNumber, aggregateId, formKey]);
  if (!form) return <div className="empty-state"><h1>Unknown form</h1></div>;
  if (form.schedule === "derived") return <DerivedFormPage formKey={formKey} />;
  function queueSave(next: LocalEntry) {
    const operation = saveChain.current.then(() => saveLocalEntry(next));
    saveChain.current = operation.then(saved => {
      if (entryRef.current === next) {
        entryRef.current = saved;
        setEntry(saved);
        setSavedAt(saved.updatedAt);
        setMessage(null);
      }
    }, error => {
      const text = error instanceof Error ? error.message : String(error);
      if (entryRef.current === next) {
        if (isDuplicateSelectionError(error)) {
          const duplicateSelection = {
            ...next,
            storageError: null
          };
          entryRef.current = duplicateSelection;
          setEntry(duplicateSelection);
          if (error instanceof DuplicateContextError) setDuplicate(error.collision);
          setMessage(null);
        } else {
          const failed = {
            ...next,
            storageError: text
          };
          entryRef.current = failed;
          setEntry(failed);
          setMessage(text);
        }
      }
    });
    return operation;
  }
  function commit(mutator: (current: LocalEntry) => LocalEntry) {
    const current = entryRef.current;
    if (!current) return;
    const mutated = mutator(current);
    const contextChanged = current.context.date !== mutated.context.date || current.context.shift !== mutated.context.shift || current.context.timeSlot !== mutated.context.timeSlot || current.context.boilerNumber !== mutated.context.boilerNumber;
    const next = {
      ...mutated,
      localVersion: current.localVersion + 1,
      context: structuredClone(mutated.context),
      values: structuredClone(mutated.values),
      storageError: null,
      uploadError: null
    };
    entryRef.current = next;
    setEntry(next);
    if (contextChanged) setMessage(null);
    void queueSave(next);
  }
  function showToast(text: string) {
    if (toastTimer.current != null) window.clearTimeout(toastTimer.current);
    setToast(text);
    toastTimer.current = window.setTimeout(() => {
      setToast(null);
      toastTimer.current = null;
    }, 3200);
  }
  async function ensureSaved() {
    await saveChain.current;
    const current = entryRef.current;
    if (!current) throw new Error("Entry is not ready.");
    if (current.storageError) throw new Error(current.storageError);
    return await queueSave(current);
  }
  function updateValue(key: string, value: FieldValue) {
    commit(e => {
      const values = {
        ...e.values,
        [key]: value
      };
      if (formKey === "boiler-water-control-tests" && (key === "p_alk_burette" || key === "m_alk_burette")) {
        values.p_alk = typeof values.p_alk_burette === "number" ? values.p_alk_burette * 20 : null;
        values.m_alk = typeof values.m_alk_burette === "number" ? values.m_alk_burette * 20 : null;
        values.oh_alk = calculateOhAlk(values.p_alk, values.m_alk);
      }
      return {
        ...e,
        values
      };
    });
  }
  async function submit(kind: "draft" | "complete") {
    const pressed = entryRef.current;
    if (kind === "complete") {
      if (completeLocked || !pressed) return;
      setCompleteLocked(true);
      completeLockTimer.current = window.setTimeout(() => {
        setCompleteLocked(false);
        completeLockTimer.current = null;
      }, 5000);
    }
    setMessage(null);
    setBusy(true);
    try {
      const current = await ensureSaved();
      const contextErrorMessage = contextError(kind === "complete" && pressed ? {
        ...current,
        operatorId: pressed.operatorId,
        operator: pressed.operator
      } : current);
      if (contextErrorMessage) throw new Error(contextErrorMessage);
      if (kind === "draft") {
        setMessage("Draft saved on this tablet. It will resume from this form and context.");
        showToast("SAVED — draft saved on this tablet.");
        return;
      }
      const completed = {
        ...current,
        operatorId: pressed?.operatorId ?? current.operatorId,
        operator: pressed?.operator ?? current.operator,
        status: "completed" as const,
        localVersion: current.localVersion + 1,
        temporaryEdit: false,
        completedAt: new Date().toISOString(),
        uploadError: null
      };
      const saved = await queueSave(completed);
      await enqueueCompleted(saved);
      finalizedEdit.current = true;
      editBaselineRef.current = null;
      setEditBaseline(null);
      entryRef.current = saved;
      setEntry(saved);
      setCompletionBanner(navigator.onLine ? "Completed locally. Uploading in the background; you can continue working." : "Completed locally while offline. It will upload automatically when this tablet is online.");
      setMessage(null);
      showToast("SUBMITTED — completed locally and queued for upload.");
      void import("../lib/sync").then(({
        syncNow
      }) => syncNow());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }
  function openEdit() {
    const current = entryRef.current;
    if (!current) return;
    const baseline = structuredClone(current);
    editBaselineRef.current = baseline;
    setEditBaseline(baseline);
    finalizedEdit.current = false;
    commit(e => ({
      ...e,
      temporaryEdit: true
    }));
  }
  async function cancelEdit() {
    const baseline = editBaselineRef.current;
    if (!baseline) return;
    try {
      await saveChain.current;
      const restored = await discardTemporaryEdit(baseline, entryRef.current?.localVersion);
      editBaselineRef.current = null;
      setEditBaseline(null);
      entryRef.current = restored;
      setEntry(restored);
      setSavedAt(restored.updatedAt);
      setCompletionBanner(restored.status === "completed" ? "The original completed record was restored on this tablet." : null);
      setMessage(null);
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error);
      const current = entryRef.current;
      if (current) {
        const failed = {
          ...current,
          storageError: text
        };
        entryRef.current = failed;
        setEntry(failed);
      }
      setMessage(text);
    }
  }
  async function replaceExisting() {
    const current = entryRef.current;
    if (!duplicate || !current) return;
    await saveChain.current;
    const baseline = structuredClone(duplicate);
    const replacement = {
      ...duplicate,
      context: structuredClone(current.context),
      operatorId: current.operatorId,
      operator: current.operator,
      values: structuredClone(current.values),
      status: (duplicate.status === "completed" ? "completed" : "draft") as "completed" | "draft",
      completedAt: duplicate.status === "completed" ? new Date().toISOString() : null,
      localVersion: Math.max(current.localVersion, duplicate.localVersion) + 1,
      temporaryEdit: duplicate.status === "completed",
      uploadError: null
    };
    const saved = await replaceLocalEntry(current.entryId, replacement);
    editBaselineRef.current = duplicate.status === "completed" ? baseline : null;
    setEditBaseline(duplicate.status === "completed" ? baseline : null);
    finalizedEdit.current = false;
    setDuplicate(null);
    entryRef.current = saved;
    setEntry(saved);
    setSavedAt(saved.updatedAt);
    setCompletionBanner(saved.status === "completed" ? "Replacement completed locally. You can cancel to restore the original completed record." : null);
  }
  function startFreshEntry() {
    const fresh = newLocalEntry(formKey, todayPlantDate());
    setAvailableDrafts(null);
    setIsNewEntry(true);
    setMessage(null);
    entryRef.current = fresh;
    setEntry(fresh);
    setCompletionBanner(null);
    setSavedAt(fresh.updatedAt);
  }
  if (loading) return <div className="loading-card">Loading form…</div>;
  if (availableDrafts && form && (form.hasShift || form.hasTimeSlot || form.hasBoiler)) return <div className="page-stack"><div className="form-page-header"><div><Link className="back-link" to="/"><ArrowLeft size={16} /> Back to forms</Link><div className="eyebrow">Form {form.number} · local-first entry</div><h1>Resume or start a new entry</h1><p>Unfinished entries for plant date {todayPlantDate()} are available on this tablet.</p></div></div><section className="card-surface"><div className="entries-title"><div><h2>Available drafts</h2><p>Choose a draft to resume, or start with a fresh entry.</p></div></div><div className="draft-choice-list">{availableDrafts.map(draft => <Link className="draft-choice" key={draft.entryId} to={`/forms/${formKey}/record/${encodeURIComponent(draft.entryId)}`}><strong>{draft.operator || "Operator not selected"}</strong><span>{draftContextDetails(form, draft)} · saved {new Date(draft.updatedAt).toLocaleTimeString()}</span></Link>)}</div><button type="button" className="primary-button" onClick={startFreshEntry}>Start fresh entry</button></section></div>;
  if (!entry) return <div className="loading-card">Loading form…</div>;
  const locked = entry.status === "completed" && !entry.temporaryEdit;
  const contextLocked = locked;
  const missing = isNewEntry && !locked ? missingMetadata(form, entry) : [];
  const metadataLocked = missing.length > 0;
  return <div className="page-stack">{toast && <div className="toast-stack" aria-live="polite" aria-atomic="true"><div className="toast success" role="status"><span className="toast-icon"><Check size={18} /></span><span>{toast}</span><button type="button" className="toast-close" aria-label="Dismiss notification" onClick={() => {
    if (toastTimer.current != null) window.clearTimeout(toastTimer.current);
    toastTimer.current = null;
    setToast(null);
  }}><X size={17} /></button></div></div>}<div className="form-page-header"><div><Link className="back-link" to="/"><ArrowLeft size={16} /> Back to forms</Link><div className="eyebrow">Form {form.number} · local-first entry</div><h1>{form.name}</h1><p>{form.description ?? "Values are saved to this tablet on every change. Only completed records upload."}</p></div></div>{!navigator.onLine && <div className="notice warning"><CloudOff size={18} /> Offline. This entry remains fully usable and will upload after completion when the tablet is online.</div>}{completionBanner && <div className="safety-status-banner" role="status" aria-live="polite"><Check size={18} /><div><strong>Completed locally</strong><span>{completionBanner}</span></div></div>}{entry.storageError && <div className="notice error"><CircleAlert size={18} /><div><strong>Local storage problem</strong><div>{entry.storageError}</div><small>Check browser storage permission and free space, then retry the field change. Complete is disabled until a durable save succeeds.</small></div></div>}{message && <div className={`notice ${message.toLowerCase().includes("error") || message.toLowerCase().includes("select") ? "error" : ""}`}><CircleAlert size={18} />{message}</div>}<section className="metadata-panel"><div className="metadata-field operator-field"><span>Operator</span><div className="operator-toggles">{operators.filter(o => o.active).map(o => <button type="button" disabled={contextLocked} key={o.id} className={`toggle-button ${entry.operatorId === o.id ? "selected" : ""}`} onClick={() => commit(e => ({
            ...e,
            operatorId: o.id,
            operator: o.name
          }))}>{o.name}</button>)}</div></div><label className="metadata-field"><span>Date</span><input type="date" disabled={contextLocked} value={entry.context.date} onChange={e => commit(x => ({
          ...x,
          context: {
            ...x.context,
            date: e.target.value
          }
        }))} /></label>{form.hasShift && <div className="metadata-field"><span>Shift</span><div className="toggle-row">{SHIFT_OPTIONS.map(s => <button type="button" disabled={contextLocked} key={s} className={`toggle-button ${entry.context.shift === s ? "selected" : ""}`} onClick={() => commit(e => ({
            ...e,
            context: {
              ...e.context,
              shift: s
            }
          }))}>{s}</button>)}</div></div>}{form.hasTimeSlot && <label className="metadata-field"><span>Time</span><select disabled={contextLocked} value={entry.context.timeSlot ?? ""} onChange={e => commit(x => ({
          ...x,
          context: {
            ...x.context,
            timeSlot: e.target.value || null
          }
        }))}><option value="">Select…</option>{TIME_SLOTS.map(t => <option key={t}>{t}</option>)}</select></label>}{form.hasBoiler && <div className="metadata-field"><span>Boiler</span><div className="toggle-row">{BOILERS.map(b => <button type="button" disabled={contextLocked} key={b} className={`toggle-button ${entry.context.boilerNumber === b ? "selected" : ""}`} onClick={() => commit(e => ({
            ...e,
            context: {
              ...e.context,
              boilerNumber: b
            }
          }))}>{b}</button>)}</div></div>}</section><div className={`entry-content-gate ${metadataLocked ? "is-locked" : ""}`}>{metadataLocked && <div className="entry-gate-notice" role="status" aria-live="polite">Complete the metadata above to begin entering this form. Still needed: {missing.join(", ")}.</div>}<div className="entry-content">{entry.status === "completed" && !entry.temporaryEdit && <div className="notice"><ShieldCheck size={18} /> This completed record can be edited as a temporary local edit. Cancel or navigate away to discard those changes. <button className="secondary-button inline" onClick={openEdit}><Pencil size={16} /> Edit completed form</button></div>}{entry.temporaryEdit && <div className="notice warning"><Pencil size={16} /> Temporary edit mode. Changes autosave locally; cancel or leave this page to discard them.</div>}{form.aiAssisted && aiFields.length > 0 && !locked && <AiCapture fields={aiFields} currentValues={entry.values} onVerified={vals => commit(e => ({
          ...e,
          values: {
            ...e.values,
            ...vals
          }
        }))} />}<FormRenderer form={form} values={entry.values} history={history} disabled={locked} derivedValues={formKey === "integrator-readings" ? form8OatExtremes.values : form2Totals.values} pendingFieldKeys={form2Totals.status === "waiting" ? [...FORM2_DAILY_TOTAL_KEYS] : []} hiddenFieldKeys={formKey === "integrator-readings" ? (form8OatExtremes.status === "hidden" ? [...FORM8_OAT_EXTREME_KEYS] : []) : (form2Totals.status === "hidden" ? [...FORM2_DAILY_TOTAL_KEYS] : [])} onChange={updateValue} onTrend={key => navigate(`/trends/${formKey}/${key}`)} /><div className="form-bottom-bar"><div><div style={{
              fontWeight: 700,
              color: entry.storageError ? "var(--error)" : "var(--success)"
            }}>{entry.storageError ? "Not durably saved" : "Saved on this tablet"}</div><div className="history-empty">{savedAt ? new Date(savedAt).toLocaleTimeString() : "Autosave begins with the first change"} · {entry.status === "completed" ? "Completed locally" : "Draft"}</div></div><div className="form-bottom-actions">{entry.temporaryEdit && <button className="secondary-button" disabled={busy} onClick={() => void cancelEdit()}><X size={17} /> Cancel</button>}{!locked && <><button className="secondary-button" disabled={busy || Boolean(entry.storageError)} onClick={() => void submit("draft")}><Save size={17} /> Keep draft</button><button className="primary-button" disabled={busy || Boolean(entry.storageError) || completeLocked} onClick={() => void submit("complete")}><Check size={17} /> Complete</button></>}</div></div></div>{duplicate && <div className="confirmation-backdrop"><div className="confirmation-dialog"><div className="confirmation-heading"><CircleAlert /><div><h2>This context already has an entry</h2><p>{duplicate.formKey} · {duplicate.context.date}{duplicate.context.shift ? ` · ${duplicate.context.shift}` : ""}{duplicate.context.timeSlot ? ` · ${duplicate.context.timeSlot}` : ""}{duplicate.context.boilerNumber ? ` · ${duplicate.context.boilerNumber}` : ""}</p><p>Choose how to continue so this tablet keeps one local draft per normalized context.</p></div></div><div className="confirmation-actions"><button className="secondary-button" onClick={() => {
              setDuplicate(null);
              navigate(`/forms/${formKey}/record/${encodeURIComponent(duplicate.entryId)}`);
            }}>Open existing</button><button className="primary-button" onClick={() => {
              if (confirm("Replace the existing local entry with these values?")) void replaceExisting();
            }}>Replace existing</button><button className="secondary-button" onClick={() => {
              dismissedDuplicateContext.current = null;
              setDuplicate(null);
              setMessage(null);
              commit(e => ({
                ...e,
                context: {
                  ...e.context,
                  ...(form.hasShift ? {
                    shift: null
                  } : {}),
                  ...(form.hasTimeSlot ? {
                    timeSlot: null
                  } : {}),
                  ...(form.hasBoiler ? {
                    boilerNumber: null
                  } : {})
                }
              }));
            }}>Cancel / change selection</button></div></div></div>}</div></div>;
}
