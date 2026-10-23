"use client";
import { useId, useState } from "react";
import { Icon } from "./Icon";
import { planLabel } from "@/lib/catalog";
export const number = (value: unknown, maximumFractionDigits = 1) =>
  value === null || value === undefined
    ? "—"
    : new Intl.NumberFormat("en-IN", { maximumFractionDigits }).format(
        Number(value),
      );
export const money = (value: unknown) =>
  value === null || value === undefined
    ? "—"
    : new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
        maximumFractionDigits: 0,
      }).format(Number(value));
export const date = (value: unknown, withTime = false) =>
  value
    ? new Intl.DateTimeFormat("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        ...(withTime
          ? { hour: "2-digit" as const, minute: "2-digit" as const }
          : {}),
        timeZone: "UTC",
      }).format(new Date(String(value)))
    : "—";
export type DataRow = Record<string, unknown>;
export function Empty({
  title = "No records for this period",
  message = "Try another date range or adjust your filters.",
}: {
  title?: string;
  message?: string;
}) {
  return (
    <div className="empty-state">
      <span>
        <Icon name="empty" size={27} />
      </span>
      <strong>{title}</strong>
      <p>{message}</p>
    </div>
  );
}
export function Metric({
  label,
  value,
  icon = "analytics",
  note,
  delta,
  accent = false,
  onClick,
}: {
  label: string;
  value: unknown;
  icon?: string;
  note?: string;
  delta?: number | null;
  accent?: boolean;
  onClick?: () => void;
}) {
  return (
    <article className={`metric-card ${accent ? "accent" : ""}`}>
      <div className="metric-top">
        <span>{label}</span>
        <span className="metric-icon">
          <Icon name={icon} size={18} />
        </span>
      </div>
      <div className="metric-value">
        {String(value ?? "—")}
        {onClick && (
          <button
            className="icon-button"
            aria-label={`View ${label}`}
            onClick={onClick}
          >
            <Icon name="arrow" size={18} />
          </button>
        )}
      </div>
      <div className="metric-note">
        {delta != null && (
          <span className={`change ${delta < 0 ? "negative" : ""}`}>
            {delta > 0 ? "+" : ""}
            {number(delta)}%
          </span>
        )}
        <span>{note || "Current platform total"}</span>
      </div>
    </article>
  );
}
export function change(current: unknown, previous: unknown) {
  return Number(previous) > 0
    ? ((Number(current) - Number(previous)) / Number(previous)) * 100
    : null;
}
export function LineChart({
  rows,
  field,
  color = "#d23f68",
  currency = false,
  label,
}: {
  rows: DataRow[];
  field: string;
  color?: string;
  currency?: boolean;
  label: string;
}) {
  const uid = useId().replaceAll(":", ""),
    [active, setActive] = useState<number | null>(null);
  if (!rows.length) return <Empty />;
  const values = rows.map((r) => Number(r[field]) || 0);
  if (!values.some((value) => value !== 0))
    return (
      <Empty
        title={`No ${label.toLowerCase()} in this period`}
        message="Try a longer date range or adjust the filters to explore more activity."
      />
    );
  const
    max = Math.max(4, Math.ceil((Math.max(1, ...values) * 1.1) / 4) * 4),
    w = 700,
    h = 210,
    left = 52,
    right = 16,
    top = 16,
    bottom = 32;
  const x = (i: number) =>
      left + (i * (w - left - right)) / Math.max(1, rows.length - 1),
    y = (v: number) => h - bottom - (v / max) * (h - top - bottom);
  const points = values.map((v, i) => `${x(i)},${y(v)}`).join(" ");
  const selected = active === null ? null : rows[active];
  return (
    <div className="chart-wrap">
      <div className="chart-tooltip" aria-live="polite">
        {selected ? (
          <>
            <span>{date(selected.day)}</span>
            <strong>
              {currency ? money(selected[field]) : number(selected[field])}{" "}
              {currency ? "" : label.toLowerCase()}
            </strong>
          </>
        ) : (
          <span>Hover or focus a point to explore</span>
        )}
      </div>
      <svg
        viewBox={`0 0 ${w} ${h}`}
        className="line-chart"
        role="group"
        aria-label={`${label} over time, ${rows.length} reporting intervals`}
      >
        <defs>
          <linearGradient id={uid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity=".18" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 0.25, 0.5, 0.75, 1].map((t) => (
          <g key={t}>
            <line
              x1={left}
              x2={w - right}
              y1={y(max * t)}
              y2={y(max * t)}
              stroke="#e9eaf1"
              strokeDasharray="3 4"
            />
            <text
              x={left - 10}
              y={y(max * t) + 4}
              textAnchor="end"
              fill="#9295a4"
              fontSize="10"
            >
              {currency
                ? new Intl.NumberFormat("en-IN", {
                    style: "currency",
                    currency: "INR",
                    notation: "compact",
                    maximumFractionDigits: 1,
                  }).format(max * t)
                : number(max * t, 0)}
            </text>
          </g>
        ))}
        <polygon
          points={`${left},${h - bottom} ${points} ${x(rows.length - 1)},${h - bottom}`}
          fill={`url(#${uid})`}
        />
        <polyline
          points={points}
          fill="none"
          stroke={color}
          strokeWidth="2.5"
          strokeLinejoin="round"
        />
        {rows.map((row, i) => (
          <g key={i}>
            {(i === 0 ||
              i === rows.length - 1 ||
              i === Math.floor(rows.length / 2)) && (
              <text
                x={x(i)}
                y={h - 7}
                textAnchor={
                  i === 0 ? "start" : i === rows.length - 1 ? "end" : "middle"
                }
                fontSize="10"
                fill="#9295a4"
              >
                {date(row.day).slice(0, 6)}
              </text>
            )}
            <circle
              cx={x(i)}
              cy={y(values[i])}
              r={active === i ? 5 : 2}
              fill={color}
            />
            <circle
              cx={x(i)}
              cy={y(values[i])}
              r="12"
              fill="transparent"
              tabIndex={0}
              role="button"
              aria-label={`${date(row.day)}: ${currency ? money(row[field]) : number(row[field])} ${label}`}
              onFocus={() => setActive(i)}
              onBlur={() => setActive(null)}
              onMouseEnter={() => setActive(i)}
              onMouseLeave={() => setActive(null)}
              onClick={() => setActive(i)}
              style={{ cursor: "crosshair" }}
            />
          </g>
        ))}
      </svg>
      {rows.length > 1 && (
        <label className="chart-scrubber">
          <span>Explore dates</span>
          <input
            type="range"
            min={0}
            max={rows.length - 1}
            value={active ?? rows.length - 1}
            aria-label={`Explore ${label.toLowerCase()} by date`}
            onChange={(event) => setActive(Number(event.target.value))}
          />
        </label>
      )}
      <details className="chart-data">
        <summary>View chart data</summary>
        <div className="chart-data-scroll">
          <table>
            <thead>
              <tr>
                <th>Date (UTC)</th>
                <th>{label}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  <td>{date(r.day)}</td>
                  <td>{currency ? money(r[field]) : number(r[field])}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
const colors = [
  "#d23f68",
  "#f08ca7",
  "#8fc7bb",
  "#e3c383",
  "#596071",
  "#df7896",
  "#b4bac8",
];
export function PlanChart({
  plans,
  onSelect,
}: {
  plans: DataRow[];
  onSelect: (key: string) => void;
}) {
  const total = plans.reduce((sum, p) => sum + Number(p.selected), 0);
  let offset = 0;
  if (!total)
    return (
      <Empty
        title="No plan records yet"
        message="Plan distribution appears when Horizon records are available."
      />
    );
  return (
    <div className="plan-chart">
      <div className="donut">
        <svg
          viewBox="0 0 180 180"
          role="img"
          aria-label={`${total} current account and workspace entitlements`}
        >
          <circle
            cx="90"
            cy="90"
            r="67"
            fill="none"
            stroke="#f0eff5"
            strokeWidth="22"
          />
          {plans.map((p, i) => {
            const length = (Number(p.selected) / total) * 421,
              prev = offset;
            offset += length;
            return (
              <circle
                key={String(p.key)}
                cx="90"
                cy="90"
                r="67"
                fill="none"
                stroke={colors[i % colors.length]}
                strokeWidth="22"
                strokeDasharray={`${Math.max(0, length - 3)} ${421 - length + 3}`}
                strokeDashoffset={-prev}
                transform="rotate(-90 90 90)"
              />
            );
          })}
        </svg>
        <span>
          <strong>{number(total, 0)}</strong>
          <small>entitlements</small>
        </span>
      </div>
      <div className="plan-legend">
        {plans.map((p, i) => (
          <button key={String(p.key)} onClick={() => onSelect(String(p.key))}>
            <span
              className="legend-dot"
              style={{ background: colors[i % colors.length] }}
            />
            <span>{planLabel(p.key)}</span>
            <strong>{number(p.selected, 0)}</strong>
            <small>{number((Number(p.selected) / total) * 100, 0)}%</small>
          </button>
        ))}
      </div>
    </div>
  );
}
export function Breakdown({
  rows,
  dimension,
  onSelect,
}: {
  rows: DataRow[];
  dimension: string;
  onSelect?: (id: string) => void;
}) {
  if (!rows.length) return <Empty title="No recorded consumption" />;
  const max = Math.max(1, ...rows.map((r) => Number(r.credits)));
  return (
    <div className="breakdown">
      {rows.map((r, i) => (
        <button
          className="breakdown-row"
          key={String(r.id || i)}
          disabled={!r.id || !onSelect}
          onClick={() => r.id && onSelect?.(String(r.id))}
        >
          <span className="rank">{String(i + 1).padStart(2, "0")}</span>
          <span className="breakdown-main">
            <span>
              {dimension === "plan" ? planLabel(r.name) : String(r.name)}
            </span>
            <span className="bar-track">
              <i
                style={{
                  width: `${Math.max(1, (Number(r.credits) / max) * 100)}%`,
                  background: colors[i % colors.length],
                }}
              />
            </span>
          </span>
          <span className="breakdown-value">
            <strong>{number(r.credits)}</strong>
            <small>credits</small>
          </span>
          {onSelect && <Icon name="chevron" size={14} />}
        </button>
      ))}
    </div>
  );
}
