import { LineChart } from "lucide-react";
import { useState } from "react";
import type { FieldDefinition, FieldValue, FormDefinition, Values } from "../types";
import { NumericField } from "./NumericField";
import { FormattedNumberInput } from "./FormattedNumberInput";
import { TrendModal } from "./TrendModal";
import { displayNumber, measurementLabel } from "../lib/format";
export type HistoryMap = Record<string, Array<{
  aggregate_id: string;
  plant_date: string;
  measured_at: string;
  numeric_value: number;
}>>;
type HistoryPoint = HistoryMap[string][number];
function PairedHistory({
  field,
  history,
  historyMode
}: {
  field: FieldDefinition;
  history: HistoryMap;
  historyMode: "shift" | "time-slot" | "daily";
}) {
  if (field.showHistory === false) return null;
  const first = history[`${field.key}:first`] ?? [];
  const second = history[`${field.key}:second`] ?? [];
  const byRecord = new Map<string, {
    first?: HistoryPoint;
    second?: HistoryPoint;
  }>();
  for (const point of first) {
    const key = `${point.aggregate_id}-${point.measured_at}`;
    const pair = byRecord.get(key) ?? {};
    pair.first = point;
    byRecord.set(key, pair);
  }
  for (const point of second) {
    const key = `${point.aggregate_id}-${point.measured_at}`;
    const pair = byRecord.get(key) ?? {};
    pair.second = point;
    byRecord.set(key, pair);
  }
  const points = [...byRecord.values()].sort((a, b) => (b.first?.measured_at ?? b.second?.measured_at ?? "").localeCompare(a.first?.measured_at ?? a.second?.measured_at ?? "")).slice(0, 5);
  return <div className="paired-history history-cell"><span className="history-title">Previous measurements</span>{points.length ? <div className="history-mini-table"><div className="history-dates">{points.map((point, index) => <span key={`${point.first?.aggregate_id ?? point.second?.aggregate_id}-${index}`}>{measurementLabel(point.first ?? point.second!, historyMode)}</span>)}</div><div className="history-values">{points.map((point, index) => <span key={`${point.first?.aggregate_id ?? point.second?.aggregate_id}-${index}-v`}>{point.first && point.second ? `${displayNumber(point.first.numeric_value)}/${displayNumber(point.second.numeric_value)}` : point.first ? `${displayNumber(point.first.numeric_value)}/` : `/${displayNumber(point.second!.numeric_value)}`}</span>)}</div></div> : <span className="history-empty">No previous measurements</span>}</div>;
}
function GenericField({
  field,
  value,
  history,
  historyMode,
  onChange,
  onTrend,
  disabled,
  allowCalculatedEdits
}: {
  field: FieldDefinition;
  value: FieldValue | undefined;
  history: HistoryMap;
  historyMode: "shift" | "time-slot" | "daily";
  onChange: (v: FieldValue) => void;
  onTrend: () => void;
  disabled: boolean;
  allowCalculatedEdits: boolean;
}) {
  if (field.type === "select") {
    const selectValue = typeof value === "string" ? value : "";
    const selectDisabled = disabled || field.calculated && !allowCalculatedEdits;
    const options = field.options ?? [];
    return <div className="generic-field"><div><div className="field-title-line"><span className="field-title">{field.label}</span>{field.trendable && <button className="trend-link" type="button" onClick={onTrend} title={`View trend for ${field.label}`} aria-label={`View trend for ${field.label}`}><LineChart size={17} /></button>}</div>{field.helpText && <div className="history-empty">{field.helpText}</div>}</div>{options.length === 2 ? <div className="toggle-row select-toggles" role="group" aria-label={field.label}>{options.map(o => {
          const selected = selectValue === o.value;
          return <button type="button" key={o.value} disabled={selectDisabled} className={`toggle-button ${selected ? "selected" : ""}`} aria-pressed={selected} onClick={() => onChange(o.value)}>{o.label}</button>;
        })}</div> : <select disabled={selectDisabled} value={selectValue} onChange={e => onChange(e.target.value || null)}><option value="">Select…</option>{options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select>}</div>;
  }
  if (field.type === "paired-number") {
    const pair = typeof value === "object" && value !== null && "first" in value ? value : {
      first: null,
      second: null
    };
    return <div className="generic-field paired-field"><div><span className="field-title">{field.label}</span></div><div className="paired-inputs">{(["first", "second"] as const).map((key, i) => <span className="paired-input" key={key}><label><span>{field.pairedLabels?.[i] ?? key}</span><FormattedNumberInput value={pair[key]} disabled={disabled} onChange={nextValue => onChange({
              ...pair,
              [key]: nextValue
            })} /></label>{i === 0 && <strong aria-hidden="true">/</strong>}</span>)}</div><PairedHistory field={field} history={history} historyMode={historyMode} /></div>;
  }
  if (field.type === "duration") {
    const minutes = typeof value === "number" ? value : 0;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return <div className="generic-field"><div><span className="field-title">{field.label}</span></div><div className="duration-inputs"><label><span>Hours</span><input type="number" min="0" disabled={disabled} value={value == null ? "" : hours} onChange={e => {
            const h = e.target.value === "" ? 0 : Number(e.target.value);
            onChange(h * 60 + mins);
          }} /></label><label><span>Minutes</span><input type="number" min="0" max="59" disabled={disabled} value={value == null ? "" : mins} onChange={e => {
            const m = e.target.value === "" ? 0 : Number(e.target.value);
            onChange(hours * 60 + m);
          }} /></label></div></div>;
  }
  return <div className="generic-field"><div><span className="field-title">{field.label}</span>{field.helpText && <div className="history-empty">{field.helpText}</div>}</div><input disabled={disabled || field.calculated && !allowCalculatedEdits} value={typeof value === "string" ? value : ""} onChange={e => onChange(e.target.value || null)} /></div>;
}
export function FormRenderer({
  form,
  values,
  history,
  onChange,
  onTrend,
  disabled = false,
  allowCalculatedEdits = false,
  derivedValues = {},
  pendingFieldKeys = [],
  hiddenFieldKeys = [],
  readOnlyDisplay = false
}: {
  form: FormDefinition;
  values: Values;
  history: HistoryMap;
  onChange: (key: string, value: FieldValue) => void;
  onTrend: (key: string) => void;
  disabled?: boolean;
  allowCalculatedEdits?: boolean;
  derivedValues?: Values;
  pendingFieldKeys?: string[];
  hiddenFieldKeys?: string[];
  readOnlyDisplay?: boolean;
}) {
  const [trendFieldKey, setTrendFieldKey] = useState<string | null>(null);
  const fields = form.sections.flatMap(section => section.fields).filter(field => !hiddenFieldKeys.includes(field.key));
  const trendField = fields.find(field => field.key === trendFieldKey && field.trendable);
  const historyMode: "shift" | "time-slot" | "daily" = form.hasShift ? "shift" : form.hasTimeSlot ? "time-slot" : "daily";
  const openTrend = (key: string) => setTrendFieldKey(key);
  return <><div className="form-sections">{form.sections.map(section => {
    const visibleFields = section.fields.filter(field => !hiddenFieldKeys.includes(field.key));
    if (!visibleFields.length) return null;
    return <section key={section.key} className={`form-section ${visibleFields.every(f => f.optional) ? "optional-section" : ""}`}><div className="section-title-block"><h2>{section.title}</h2>{section.description && <p>{section.description}</p>}</div><div className="section-fields">{visibleFields.map(field => {
      const value = field.key in derivedValues ? derivedValues[field.key] : values[field.key];
      return field.type === "number" || field.type === "computed" ? <NumericField key={field.key} field={field} value={value} history={history[field.key] ?? []} onChange={v => onChange(field.key, v)} onTrend={() => openTrend(field.key)} historyMode={historyMode} disabled={disabled} allowCalculatedEdits={allowCalculatedEdits} pending={pendingFieldKeys.includes(field.key)} readOnlyDisplay={readOnlyDisplay} /> : <GenericField key={field.key} field={field} value={value} history={history} historyMode={historyMode} onChange={v => onChange(field.key, v)} onTrend={() => openTrend(field.key)} disabled={disabled} allowCalculatedEdits={allowCalculatedEdits} />;
    })}</div></section>;
  })}</div>{trendField && <TrendModal formKey={form.key} field={trendField} initialPoints={history[trendField.key] ?? []} onClose={() => setTrendFieldKey(null)} />}</>;
}
