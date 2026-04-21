"use client";

import { THEME } from "../lib/theme";

type Props = {
  straddleMid: number | null;
  openingStraddle: number | null;
  realizedPts: number | null;
  realizedPct: number | null;
  atmIv: number | null;
  skew: number | null;
  skewPctile: number | null;
  vix1dVixRatio: number | null;
};

function fmtDollar(v: number | null, decimals: number = 2): string {
  return v === null ? "—" : `$${v.toFixed(decimals)}`;
}

function fmtPct(v: number | null, decimals: number = 1): string {
  return v === null ? "—" : `${(v * 100).toFixed(decimals)}`;
}

function fmtNum(v: number | null, decimals: number = 2): string {
  return v === null ? "—" : v.toFixed(decimals);
}

type CellSpec = {
  label: string;
  value: string;
  valueColor?: string;
  context?: string;
  contextColor?: string;
};

function Cell({
  label,
  value,
  valueColor,
  context,
  contextColor,
  col,
  row,
}: CellSpec & { col: number; row: number }) {
  const borderClass = [
    col > 0 ? "border-l" : "",
    row > 0 ? "border-t" : "",
    col > 0 || row > 0 ? "border-border-2" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={`bg-page px-3 py-2 ${borderClass}`}>
      <div className="font-sans text-xs uppercase tracking-[0.05em] text-text-4">
        {label}
      </div>
      <div
        className="font-mono text-base font-medium leading-tight mt-0.5"
        style={{ color: valueColor ?? THEME.text }}
      >
        {value}
      </div>
      {context && (
        <div
          className="font-sans text-[9px] uppercase tracking-wide mt-0.5"
          style={{ color: contextColor ?? THEME.text4 }}
        >
          {context}
        </div>
      )}
    </div>
  );
}

export default function MetricsGrid({
  straddleMid,
  openingStraddle,
  realizedPts,
  realizedPct,
  atmIv,
  skew,
  skewPctile,
  vix1dVixRatio,
}: Props) {
  const realizedColor =
    realizedPct === null
      ? THEME.text
      : realizedPct >= 100
        ? THEME.down
        : realizedPct >= 70
          ? THEME.amber
          : THEME.text;

  const volRatioColor =
    vix1dVixRatio === null
      ? THEME.text
      : vix1dVixRatio >= 1.0
        ? THEME.amber
        : THEME.text;

  const cells: CellSpec[] = [
    { label: "STRADDLE", value: fmtDollar(straddleMid), context: "MID" },
    { label: "IMPLIED", value: fmtDollar(openingStraddle), context: "OPEN" },
    {
      label: "REALIZED",
      value: realizedPts !== null ? `${realizedPts.toFixed(1)}pt` : "—",
      valueColor: realizedColor,
      context:
        realizedPct !== null ? `${realizedPct.toFixed(0)}% IMP` : undefined,
      contextColor: realizedColor,
    },
    { label: "IV30", value: fmtPct(atmIv), context: "ATM" },
    {
      label: "SKEW",
      value: fmtNum(skew, 3),
      context: skewPctile !== null ? `${skewPctile}%ILE` : undefined,
      contextColor:
        skewPctile !== null && skewPctile >= 75 ? THEME.amber : THEME.text4,
    },
    {
      label: "1D VOL RATIO",
      value: fmtNum(vix1dVixRatio),
      valueColor: volRatioColor,
      context: "1D/30D",
    },
  ];

  return (
    <div className="grid grid-cols-3 border border-border-2">
      {cells.map((cell, idx) => (
        <Cell
          key={cell.label}
          {...cell}
          col={idx % 3}
          row={Math.floor(idx / 3)}
        />
      ))}
    </div>
  );
}
