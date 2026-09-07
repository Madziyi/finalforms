import { ArrowLeft, LineChart } from "lucide-react";
import { type CSSProperties, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { allFields, getForm } from "../forms";
import { getPublicRecord, getRecord } from "../lib/api";
import { getDeviceToken } from "../lib/device";
import { displayNumber } from "../lib/format";
import { resolveForm2DailyTotals } from "../lib/form2DailyTotals";
import { resolveForm8OatExtrema } from "../lib/form8OatExtrema";
import { getDerivedProjectionDate, projectionOriginLabel, resolveDerivedProjection, type ResolvedDerivedProjection } from "../lib/derivedProjections";
import { loadLocalEntry, localEntryToRecord } from "../lib/offlineDb";
import type { CanonicalRecord, FieldValue } from "../types";
const FORM8_OAT_EXTREME_KEYS = ["oat_high", "oat_low"] as const;
function valueLabel(value: FieldValue) {
  if (value === null || value === undefined || value === "") return "";
  if (typeof value === "number") return displayNumber(value);
  if (typeof value === "object") return `${value.first == null ? "" : displayNumber(value.first)}/${value.second == null ? "" : displayNumber(value.second)}`;
  return String(value);
}
function contextLabel(record: CanonicalRecord) {
  return [record.date, record.timeSlot ?? record.shift ?? "Daily", record.boilerNumber ? `Boiler ${record.boilerNumber}` : null, record.operator || "No operator"].filter(Boolean).join(" · ");
}
export function RecordViewPage() {
  const {
    formKey = "",
    recordId = ""
  } = useParams();
  const form = getForm(formKey);
  const [record, setRecord] = useState<CanonicalRecord | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [projection, setProjection] = useState<ResolvedDerivedProjection | null>(null);
  const [form2Totals, setForm2Totals] = useState<Awaited<ReturnType<typeof resolveForm2DailyTotals>>>({ sourceDate: null, status: "hidden", values: {} });
  const [form8OatExtremes, setForm8OatExtremes] = useState<Awaited<ReturnType<typeof resolveForm8OatExtrema>>>({ sourceDate: "", status: "hidden", values: { oat_high: null, oat_low: null } });
  const fieldMap = useMemo(() => new Map(form ? allFields(form).map(field => [field.key, field]) : []), [form]);
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const id = decodeURIComponent(recordId);
    setRecord(null);
    setProjection(null);
    setMessage(null);
    void (async () => {
      try {
        if (form?.schedule === "derived") {
          const date = getDerivedProjectionDate(formKey, id);
          if (!date) throw new Error("This derived projection ID is invalid.");
          const local = await resolveDerivedProjection(formKey, date, { online: false, signal: controller.signal });
          if (local.record && !cancelled) { setProjection(local); setRecord(local.record); }
          if (navigator.onLine) {
            const remote = await resolveDerivedProjection(formKey, date, { signal: controller.signal });
            if (!cancelled && (remote.record || !local.record)) { setProjection(remote); setRecord(remote.record); }
            if (!remote.record && !local.record && !cancelled) setMessage("This projection has no exact source records yet.");
          } else if (!local.record && !cancelled) {
            setMessage("This projection is not available from exact local Form 8 sources while offline.");
          }
          return;
        }
        const local = await loadLocalEntry(id);
        if (local && !cancelled) {
          setRecord(await localEntryToRecord(local));
          return;
        }
        if (!navigator.onLine) {
          if (!cancelled) setMessage("This record is not saved on this tablet and cloud data is unavailable while offline.");
          return;
        }
        if (getDeviceToken()) {
          const result = await getRecord(id, controller.signal);
          if (!cancelled) setRecord(result.current);
        } else {
          const result = await getPublicRecord(id, controller.signal);
          if (!cancelled) setRecord(result.record);
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        if (!cancelled) setMessage(error instanceof Error ? error.message : "Could not load this record.");
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [recordId, formKey, form?.schedule]);
  useEffect(() => {
    if (formKey !== "boiler-water-control-tests" || !record) return;
    let cancelled = false;
    const refresh = () => void resolveForm2DailyTotals({ date: record.date, shift: record.shift as "Day" | "Night" | "Extra" | null, boilerNumber: record.boilerNumber as 2 | 3 | 4 | null }).then(totals => {
      if (!cancelled) setForm2Totals(totals);
    });
    refresh();
    window.addEventListener("ecc-local-change", refresh);
    return () => {
      cancelled = true;
      window.removeEventListener("ecc-local-change", refresh);
    };
  }, [formKey, record?.date, record?.shift, record?.boilerNumber]);
  useEffect(() => {
    if (formKey !== "integrator-readings" || !record) {
      setForm8OatExtremes({ sourceDate: "", status: "hidden", values: { oat_high: null, oat_low: null } });
      return;
    }
    let cancelled = false;
    const refresh = () => void resolveForm8OatExtrema({ date: record.date }).then(extremes => {
      if (!cancelled) setForm8OatExtremes(extremes);
    });
    refresh();
    window.addEventListener("ecc-local-change", refresh);
    return () => {
      cancelled = true;
      window.removeEventListener("ecc-local-change", refresh);
    };
  }, [formKey, record?.date]);
  if (!form) return <div className="empty-state"><h2>Unknown form</h2></div>;
  if (message) return <div className="page-stack"><div className="notice error">{message}</div><Link className="secondary-button inline" to={`/data/${form.key}`}><ArrowLeft size={16} /> Back to entries</Link></div>;
  if (!record) return <div className="loading-card">Loading entry…</div>;
  const extraKeys = Object.keys(record.values).filter(key => !fieldMap.has(key) && !key.startsWith("_"));
  return <div className="page-stack record-view">
    <div className="form-page-header"><div><Link to={`/data/${form.key}`} className="back-link"><ArrowLeft size={17} /> Back to entries</Link><div className="eyebrow">Historical entry</div><h1>{form.name}</h1><p>{contextLabel(record)}</p></div></div>
    {form.schedule === "derived" && projection && <div className={`notice ${projection.status === "current" ? "" : "warning"}`}>{projectionOriginLabel(projection.origin, projection.status)}{projection.warnings.length ? ` · ${projection.warnings.join(" ")}` : ""}</div>}
    {form.sections.map(section => {
      const isForm2OperatingSection = formKey === "boiler-water-control-tests" && section.key === "operating";
      const isForm8WeatherSection = formKey === "integrator-readings" && section.key === "weather";
      const displayedFields = section.fields.filter(field => field.recordVisible !== false).filter(field => !isForm2OperatingSection || !["steam_total", "makeup_total"].includes(field.key)).filter(field => !isForm8WeatherSection || !FORM8_OAT_EXTREME_KEYS.includes(field.key as typeof FORM8_OAT_EXTREME_KEYS[number])).filter(field => Boolean(valueLabel(record.values[field.key])));
      const derivedFields = isForm2OperatingSection && form2Totals.status !== "hidden" ? section.fields.filter(field => field.recordVisible !== false && ["steam_total", "makeup_total"].includes(field.key)) : [];
      const form8DerivedFields = isForm8WeatherSection && form8OatExtremes.status !== "hidden" ? section.fields.filter(field => FORM8_OAT_EXTREME_KEYS.includes(field.key as typeof FORM8_OAT_EXTREME_KEYS[number])) : [];
      const fields = [...displayedFields, ...derivedFields, ...form8DerivedFields];
      return <section className="detail-section card-surface" key={section.key}><h2>{section.title}</h2><div className="detail-grid" style={{
          "--reading-rows": Math.ceil(fields.length / 2)
        } as CSSProperties}>{fields.map(field => {
            const isDerivedTotal = ["steam_total", "makeup_total"].includes(field.key);
            const isDerivedOat = FORM8_OAT_EXTREME_KEYS.includes(field.key as typeof FORM8_OAT_EXTREME_KEYS[number]);
            const value = isDerivedTotal ? form2Totals.values[field.key] : isDerivedOat ? form8OatExtremes.values[field.key] : record.values[field.key];
            const display = valueLabel(value);
            return <div className="detail-value" key={field.key}><span>{field.label}</span><div><strong>{isDerivedTotal && form2Totals.status === "waiting" ? "Waiting for daily totals" : `${display}${field.unit ? ` ${field.unit}` : ""}`}</strong>{field.trendable && typeof value === "number" && <Link to={`/trends/${form.key}/${field.key}`}><LineChart size={16} /> Trend</Link>}</div></div>;
          })}</div></section>;
    })}
    {extraKeys.length > 0 && <div className="notice">This entry contains older fields not present in the current form definition. They remain stored in the database/export.</div>}
  </div>;
}
