import { CircleAlert, LoaderCircle, RefreshCw, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Brush,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { FieldDefinition } from "../types";
import { getForm } from "../forms";
import { getTrend } from "../lib/api";
import { displayNumber, formatTimestamp, historyLabel, measurementLabel } from "../lib/format";

export type TrendPoint = {
  aggregate_id: string;
  plant_date: string;
  measured_at: string;
  numeric_value: number;
};

type TrendModalProps = {
  formKey: string;
  field: FieldDefinition;
  initialPoints: TrendPoint[];
  onClose: () => void;
};

type ChartPoint = {
  label: string;
  axisDay: string;
  value: number;
};

type TrendAxisTickProps = {
  x?: number | string;
  y?: number | string;
  payload?: { index?: number };
  chartData: ChartPoint[];
};

function TrendAxisTick({ x = 0, y = 0, payload, chartData }: TrendAxisTickProps) {
  const point = chartData[payload?.index ?? -1];
  if (!point) return null;

  return (
    <g transform={`translate(${x},${y})`} className="trend-axis-tick">
      <text y={19}>{point.axisDay}</text>
    </g>
  );
}

function TrendChart({ points, field }: { points: TrendPoint[]; field: FieldDefinition }) {
  const chartData = useMemo<ChartPoint[]>(
    () => [...points]
      .sort((a, b) => Date.parse(a.measured_at) - Date.parse(b.measured_at))
      .map((point) => ({
        label: historyLabel(point),
        axisDay: new Date(`${point.plant_date}T12:00:00`).toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
        }),
        value: point.numeric_value,
      })),
    [points],
  );

  const renderAxisTick = (props: any) => <TrendAxisTick {...props} chartData={chartData} />;

  return (
    <div className="trend-modal-chart" role="img" aria-label={`${field.label} historical readings chart`}>
      <ResponsiveContainer width="100%" height={400}>
        <LineChart data={chartData} margin={{ top: 16, right: 20, left: 0, bottom: 22 }}>
          <CartesianGrid stroke="#dfe4ec" strokeDasharray="4 4" vertical={false} />
          <XAxis
            dataKey="label"
            height={54}
            interval="preserveStartEnd"
            tick={renderAxisTick}
            axisLine={{ stroke: "#aeb7c5" }}
            tickLine={false}
          />
          <YAxis
            dataKey="value"
            width={62}
            domain={["auto", "auto"]}
            axisLine={{ stroke: "#aeb7c5" }}
            tickLine={false}
            tick={{ fill: "#718099", fontSize: 13 }}
          />
          <Tooltip
            cursor={{ stroke: "#c8ceda", strokeDasharray: "4 4" }}
            formatter={(value) => [`${value}${field.unit ? ` ${field.unit}` : ""}`, field.label]}
            labelFormatter={(label) => `Reading: ${label}`}
          />
          <Line
            type="monotone"
            dataKey="value"
            stroke="#5b57d6"
            strokeWidth={3}
            dot={{ r: 5, fill: "#fff", stroke: "#5b57d6", strokeWidth: 2.5 }}
            activeDot={{ r: 7, fill: "#5b57d6", stroke: "#fff", strokeWidth: 2 }}
            isAnimationActive={false}
          />
          <Brush
            dataKey="label"
            height={28}
            travellerWidth={12}
            tickFormatter={() => ""}
            fill="#e1e1e1"
            stroke="#707070"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function TrendModal({ formKey, field, initialPoints, onClose }: TrendModalProps) {
  const [points, setPoints] = useState<TrendPoint[]>(initialPoints);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const headingId = `trend-modal-heading-${field.key}`;

  useEffect(() => {
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeButtonRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
      previousFocusRef.current?.focus();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setPoints(initialPoints);

    void getTrend(formKey, field.key, 200)
      .then((result) => {
        if (!cancelled) setPoints(result.points);
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : String(reason));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [field.key, formKey, initialPoints, retryCount]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const sortedPoints = [...points].sort((a, b) => Date.parse(b.measured_at) - Date.parse(a.measured_at));
  const trendForm = getForm(formKey);
  const historyMode: "shift" | "time-slot" | "daily" = trendForm?.hasShift ? "shift" : trendForm?.hasTimeSlot ? "time-slot" : "daily";
  const closeOnBackdrop = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) onClose();
  };

  return (
    <div className="trend-modal-backdrop" onClick={closeOnBackdrop}>
      <section
        className="trend-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="trend-modal-header">
          <div>
            <div className="eyebrow">Persisted history</div>
            <h2 id={headingId}>{field.label}</h2>
            <p>{field.unit || "Recorded value"} · {points.length} of 15 most recent readings</p>
          </div>
          <button ref={closeButtonRef} className="icon-button trend-modal-close" type="button" onClick={onClose} aria-label="Close trend history">
            <X size={21} aria-hidden="true" />
          </button>
        </div>

        {loading && <div className="loading-card plain trend-modal-state" role="status" aria-live="polite"><LoaderCircle className="spin" size={20} aria-hidden="true" /> Loading trend history…</div>}
        {error && <div className="notice error trend-modal-error" role="alert"><CircleAlert size={18} aria-hidden="true" /><span>Unable to load the latest trend history. {error}</span><button className="secondary-button inline" type="button" onClick={() => setRetryCount((count) => count + 1)}><RefreshCw size={15} aria-hidden="true" /> Try again</button></div>}
        {!loading && !error && points.length === 0 && <div className="empty-state small trend-modal-state"><h3>No trend history yet</h3><p>Published measurements will appear here after this field has been completed.</p></div>}
        {!loading && !error && points.length > 0 && <TrendChart points={points} field={field} />}

        {!loading && !error && points.length > 0 && <section className="trend-reading-details" aria-labelledby={`trend-details-heading-${field.key}`}>
          <h3 id={`trend-details-heading-${field.key}`}>Exact readings</h3>
          <div className="trend-reading-list">
            {sortedPoints.map((point) => (
              <span className="trend-reading" key={`${point.aggregate_id}-${point.measured_at}`}>
                {measurementLabel(point, historyMode)} · {displayNumber(point.numeric_value)}{field.unit ? ` ${field.unit}` : ""}
              </span>
            ))}
          </div>
        </section>}
      </section>
    </div>
  );
}
