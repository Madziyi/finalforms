import { LineChart, TriangleAlert } from "lucide-react";
import type { FieldDefinition, FieldValue } from "../types";
import { displayNumber, measurementLabel } from "../lib/format";

function outside(value: number, field: FieldDefinition) {
  if (!field.target) return false;
  if (field.target.min !== undefined && value < field.target.min) return true;
  if (field.target.max !== undefined && value > field.target.max) return true;
  return false;
}

export function NumericField({ field, value, history, onChange, onTrend, historyMode = "daily", disabled = false, allowCalculatedEdits = false, pending = false }: {
  field: FieldDefinition;
  value: FieldValue | undefined;
  history: Array<{ aggregate_id: string; plant_date: string; measured_at: string; numeric_value: number }>;
  onChange: (v: number | null) => void;
  onTrend: () => void;
  historyMode?: "shift" | "time-slot" | "daily";
  disabled?: boolean;
  allowCalculatedEdits?: boolean;
  pending?: boolean;
}) {
  const numeric = typeof value === "number" ? value : null;
  const warn = numeric !== null && outside(numeric, field);
  const showHistory = field.showHistory !== false;
  return <div className={`numeric-row ${warn ? "outside" : ""} ${showHistory ? "" : "no-history"}`} style={showHistory ? undefined : { gridTemplateColumns: "minmax(220px, 1.1fr) minmax(170px, .75fr)" }}>
    <div className="field-heading"><div className="field-title-line"><span className="field-title">{field.label}</span>{field.trendable && <button className="trend-link" type="button" onClick={onTrend} title="View trend"><LineChart size={17} /></button>}{field.target && <span className="target-pill">Target: {field.target.label}</span>}{field.calculated && <span className="target-pill">Calculated</span>}</div>{field.helpText && <small style={{ color: "var(--muted)" }}>{field.helpText}</small>}</div>
    <div className="entry-cell"><span>Entry</span><div className="input-with-unit">{pending ? <span className="history-empty">Waiting for daily totals</span> : <><input inputMode="decimal" type="number" step="any" value={numeric ?? ""} disabled={disabled || field.calculated && !allowCalculatedEdits} onChange={e => onChange(e.target.value === "" ? null : Number(e.target.value))} />{field.unit && <span className="unit-suffix">{field.unit}</span>}</>}</div>{warn && <span className="range-warning"><TriangleAlert size={14} /> Outside target</span>}</div>
    {showHistory && <div className="history-cell"><span className="history-title">Previous measurements</span>{history.length ? <div className="history-mini-table"><div className="history-dates">{history.slice(0, 5).map(p => <span key={`${p.aggregate_id}-${p.measured_at}`}>{measurementLabel(p, historyMode)}</span>)}</div><div className="history-values">{history.slice(0, 5).map(p => <span key={`${p.aggregate_id}-${p.measured_at}-v`}>{displayNumber(p.numeric_value)}</span>)}</div></div> : <span className="history-empty">No previous measurements</span>}</div>}
  </div>;
}
