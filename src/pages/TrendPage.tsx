import { ArrowLeft, BarChart3, CircleAlert, LoaderCircle, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Brush, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { allFields, getForm } from "../forms";
import { getPublicTrend, getTrend } from "../lib/api";
import { getDeviceToken } from "../lib/device";
import { listLocalEntries } from "../lib/offlineDb";
import { displayNumber, formatTimestamp, historyLabel } from "../lib/format";
import { shiftMeasuredAt } from "../../shared/safetyContract";
import type { FieldDefinition } from "../types";
type TrendPoint = Awaited<ReturnType<typeof getTrend>>["points"][number];
type PointRange = 7 | 30 | 90 | 365;
const POINT_RANGES: Array<{
  value: PointRange;
  label: string;
}> = [{
  value: 7,
  label: "7 points"
}, {
  value: 30,
  label: "30 points"
}, {
  value: 90,
  label: "90 points"
}, {
  value: 365,
  label: "All available · up to 365"
}];
function numericTrendField(field: FieldDefinition) {
  return Boolean(field.trendable && (field.type === "number" || field.type === "computed"));
}
function valueLabel(point: TrendPoint, field: FieldDefinition) {
  return `${displayNumber(point.numeric_value)}${field.unit ? ` ${field.unit}` : ""}`;
}
type ChartPoint = {
  label: string;
  axisDay: string;
  value: number;
};
type TrendAxisTickProps = {
  x?: number | string;
  y?: number | string;
  payload?: {
    index?: number;
  };
  chartData: ChartPoint[];
};
function TrendAxisTick({
  x = 0,
  y = 0,
  payload,
  chartData
}: TrendAxisTickProps) {
  const point = chartData[payload?.index ?? -1];
  if (!point) return null;
  return <g transform={`translate(${x},${y})`} className="trend-axis-tick">
      <text y={19}>{point.axisDay}</text>
    </g>;
}
function TrendChart({
  points,
  field
}: {
  points: TrendPoint[];
  field: FieldDefinition;
}) {
  const chartData = useMemo<ChartPoint[]>(() => [...points].sort((a, b) => Date.parse(a.measured_at) - Date.parse(b.measured_at)).map(point => ({
    label: historyLabel(point),
    axisDay: new Date(`${point.plant_date}T12:00:00`).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric"
    }),
    value: point.numeric_value
  })), [points]);
  const renderAxisTick = (props: any) => <TrendAxisTick {...props} chartData={chartData} />;
  return <div className="trend-chart-shell">
      <div className="trend-chart-frame" role="img" aria-label={`${field.label} historical readings chart`}>
        <ResponsiveContainer width="100%" height={430}>
          <LineChart data={chartData} margin={{
          top: 18,
          right: 26,
          left: 4,
          bottom: 22
        }}>
            <CartesianGrid stroke="#dfe4ec" strokeDasharray="4 4" vertical={false} />
            <XAxis dataKey="label" height={54} interval="preserveStartEnd" tick={props => renderAxisTick(props)} axisLine={{
            stroke: "#aeb7c5"
          }} tickLine={false} />
            <YAxis dataKey="value" width={82} domain={["auto", "auto"]} axisLine={{
            stroke: "#aeb7c5"
          }} tickLine={false} tick={{
            fill: "#718099",
            fontSize: 13
          }} />
            <Tooltip cursor={{
            stroke: "#c8ceda",
            strokeDasharray: "4 4"
          }} formatter={value => [`${value}${field.unit ? ` ${field.unit}` : ""}`, field.label]} labelFormatter={label => `Reading: ${label}`} />
            <Line type="monotone" dataKey="value" stroke="#5b57d6" strokeWidth={3} dot={{
            r: 5,
            fill: "#fff",
            stroke: "#5b57d6",
            strokeWidth: 2.5
          }} activeDot={{
            r: 7,
            fill: "#5b57d6",
            stroke: "#fff",
            strokeWidth: 2
          }} isAnimationActive={false} />
            <Brush dataKey="label" height={28} travellerWidth={12} tickFormatter={() => ""} fill="#e1e1e1" stroke="#707070" />
          </LineChart>
        </ResponsiveContainer>
      </div>
      {chartData.length === 1 && <p className="trend-chart-note">One published point is available. A line will appear after another reading is recorded.</p>}
    </div>;
}
export function TrendPage() {
  const {
    formKey = "",
    fieldKey
  } = useParams();
  const navigate = useNavigate();
  const form = getForm(formKey);
  const fields = useMemo(() => form ? allFields(form).filter(numericTrendField) : [], [form]);
  const routeField = fields.some(field => field.key === fieldKey) ? fieldKey : fields[0]?.key ?? "";
  const [selectedFieldKey, setSelectedFieldKey] = useState(routeField);
  const [pointRange, setPointRange] = useState<PointRange>(30);
  const [points, setPoints] = useState<TrendPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [authenticated, setAuthenticated] = useState(Boolean(getDeviceToken()));
  useEffect(() => setSelectedFieldKey(routeField), [routeField]);
  useEffect(() => {
    const onToken = () => setAuthenticated(Boolean(getDeviceToken()));
    window.addEventListener("ecc-device-token", onToken);
    return () => window.removeEventListener("ecc-device-token", onToken);
  }, []);
  useEffect(() => {
    if (!selectedFieldKey) {
      setPoints([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setMessage(null);
    setPoints([]);
    const loadTrend = authenticated ? getTrend : getPublicTrend;
    void (async () => {
      const remote = await loadTrend(formKey, selectedFieldKey, pointRange);
      if (!authenticated) return remote.points;
      const local = await listLocalEntries(formKey);
      const localPoints = local.filter(entry => entry.status === "completed" && typeof entry.values[selectedFieldKey] === "number").map(entry => ({
        aggregate_id: entry.entryId,
        plant_date: entry.context.date,
        measured_at: entry.context.timeSlot ? `${entry.context.date}T${entry.context.timeSlot}:00` : shiftMeasuredAt(entry.context.date, entry.context.shift),
        numeric_value: entry.values[selectedFieldKey] as number
      }));
      const merged = new Map(remote.points.map(point => [point.aggregate_id, point]));
      for (const point of localPoints) merged.set(point.aggregate_id, point);
      return [...merged.values()].sort((a, b) => b.measured_at.localeCompare(a.measured_at)).slice(0, 365);
    })().then(points => {
      if (!cancelled) setPoints(points);
    }).catch((reason: unknown) => {
      if (!cancelled) setMessage(reason instanceof Error ? reason.message : String(reason));
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [authenticated, formKey, pointRange, retryCount, selectedFieldKey]);
  if (!form) return <div className="empty-state"><h1>Unknown form</h1><p>This trend view is not available for the selected form.</p></div>;
  const field = fields.find(item => item.key === selectedFieldKey);
  const latest = [...points].sort((a, b) => Date.parse(b.measured_at) - Date.parse(a.measured_at))[0];
  if (!field) return <div className="page-stack trend-page">
      <div className="trend-page-hero"><Link className="back-link" to={`/data/${formKey}`}><ArrowLeft size={16} aria-hidden="true" /> Data Viewing</Link><div className="eyebrow">Trend</div><h1>{form.name}</h1><p>Historical numerical readings</p></div>
      <div className="empty-state"><BarChart3 size={28} aria-hidden="true" /><h2>No numeric trends available</h2><p>Only published numeric readings can be plotted here.</p></div>
    </div>;
  const onFieldChange = (nextFieldKey: string) => {
    setSelectedFieldKey(nextFieldKey);
    navigate(`/trends/${formKey}/${nextFieldKey}`, {
      replace: true
    });
  };
  return <div className="page-stack trend-page">
      <div className="trend-page-hero">
        <Link className="back-link" to={`/data/${formKey}`}><ArrowLeft size={16} aria-hidden="true" /> Data Viewing</Link>
        <div className="eyebrow">Trend</div>
        <h1>{form.name}</h1>
        <p>Historical numerical readings</p>
      </div>

      <section className="trend-controls card-surface" aria-label="Trend controls">
        <label><span>Reading</span><select aria-label="Reading" value={selectedFieldKey} onChange={event => onFieldChange(event.target.value)}>{fields.map(item => <option key={item.key} value={item.key}>{item.label}</option>)}</select></label>
        <label><span>Points</span><select aria-label="Number of trend points" value={pointRange} onChange={event => setPointRange(Number(event.target.value) as PointRange)}>{POINT_RANGES.map(range => <option key={range.value} value={range.value}>{range.value === 365 ? "All available" : range.value}</option>)}</select></label>
      </section>

      <section className="trend-card card-surface" aria-labelledby="trend-card-heading">
        <div className="trend-title">
          <div>
            <div className="eyebrow">Selected reading</div>
            <h2 id="trend-card-heading">{field.label}</h2>
            <div className="trend-meta">{field.target ? `Target: ${field.target.label}` : field.unit || "Unit not specified"}</div>
          </div>
          <div className="trend-latest" aria-label={latest ? `Latest reading ${valueLabel(latest, field)}` : "No latest reading"}>
            <span>Latest</span>
            <strong>{latest ? displayNumber(latest.numeric_value) : "—"}</strong>
            <small>{latest ? `${formatTimestamp(latest.measured_at)}${field.unit ? ` · ${field.unit}` : ""}` : "No published data"}</small>
          </div>
        </div>
        {loading && <div className="loading-card plain trend-page-state" role="status" aria-live="polite"><LoaderCircle className="spin" size={22} aria-hidden="true" /> Loading trend history…</div>}
        {message && <div className="notice error trend-page-error" role="alert"><CircleAlert size={18} aria-hidden="true" /><span>Unable to load trend history. {message}</span><button className="secondary-button inline" type="button" onClick={() => setRetryCount(count => count + 1)}><RefreshCw size={15} aria-hidden="true" /> Try again</button></div>}
        {!loading && !message && points.length === 0 && <div className="empty-state small trend-page-state"><h3>No published measurements yet</h3><p>Completed server-confirmed readings for this field will appear here.</p></div>}
        {!loading && !message && points.length > 0 && <TrendChart points={points} field={field} />}
      </section>

      {!loading && !message && points.length > 0 && <section className="card-surface trend-readings-card" aria-labelledby="trend-readings-heading"><div className="entries-title"><div><h2 id="trend-readings-heading">Exact readings</h2><p>{points.length} published measurement{points.length === 1 ? "" : "s"} · newest first</p></div></div><div className="trend-readings-table-wrap"><table className="records-table trend-readings-table"><thead><tr><th scope="col">Measured</th><th scope="col">Plant date</th><th scope="col">Value</th></tr></thead><tbody>{[...points].sort((a, b) => Date.parse(b.measured_at) - Date.parse(a.measured_at)).map(point => <tr key={`${point.aggregate_id}-${point.measured_at}`}><td><time dateTime={point.measured_at}>{formatTimestamp(point.measured_at)}</time></td><td>{point.plant_date}</td><td><strong>{valueLabel(point, field)}</strong></td></tr>)}</tbody></table></div></section>}
    </div>;
}
