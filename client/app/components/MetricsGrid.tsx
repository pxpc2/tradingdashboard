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
  dealerTotal: number | null;
  dealerLocal: number | null;
  dealerCexTotal: number | null;
  dealerCexLocal: number | null;
  dealerTopPosStrike: number | null;
  dealerTopPosValue: number | null;
  dealerTopNegStrike: number | null;
  dealerTopNegValue: number | null;
};

function fmtDollar(v: number | null, decimals = 2): string {
  return v === null ? "—" : `$${v.toFixed(decimals)}`;
}

function fmtPct(v: number | null, decimals = 1): string {
  return v === null ? "—" : `${(v * 100).toFixed(decimals)}`;
}

function fmtNum(v: number | null, decimals = 2): string {
  return v === null ? "—" : v.toFixed(decimals);
}

function fmtGex(v: number | null): string {
  if (v === null) return "—";
  const abs = Math.abs(v);
  const sign = v >= 0 ? "+" : "-";
  if (abs >= 1e9) return `${sign}${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${sign}${(abs / 1e6).toFixed(0)}M`;
  return `${sign}${abs.toFixed(0)}`;
}

function gexColor(v: number | null): string {
  if (v === null) return THEME.text;
  return v >= 0 ? THEME.up : THEME.down;
}

type CellSpec = {
  label: string;
  value: string;
  valueColor?: string;
  value2?: string;
  value2Color?: string;
  context?: string;
  contextColor?: string;
};

function Cell({
  label,
  value,
  valueColor,
  value2,
  value2Color,
  context,
  contextColor,
  col,
  row,
}: CellSpec & { col: number; row: number }) {
  const borderClass = [
    col > 0 ? "border-l border-border-2" : "",
    row > 0 ? "border-t border-border-2" : "",
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
      {value2 !== undefined && (
        <div
          className="font-mono text-sm font-medium leading-tight"
          style={{ color: value2Color ?? THEME.text3 }}
        >
          {value2}
        </div>
      )}
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
  dealerTotal,
  dealerLocal,
  dealerCexTotal,
  dealerCexLocal,
  dealerTopPosStrike,
  dealerTopPosValue,
  dealerTopNegStrike,
  dealerTopNegValue,
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

  const localDiverges =
    dealerTotal !== null &&
    dealerLocal !== null &&
    Math.sign(dealerTotal) !== Math.sign(dealerLocal);

  const cells: CellSpec[] = [
    // ── Row 1 ──
    {
      label: "STRADDLE",
      value: fmtDollar(straddleMid),
      context: "MID",
    },
    {
      label: "IMPLIED",
      value: fmtDollar(openingStraddle),
      context: "OPEN",
    },
    {
      label: "REALIZED",
      value: realizedPts !== null ? `${realizedPts.toFixed(1)}pt` : "—",
      valueColor: realizedColor,
      context:
        realizedPct !== null ? `${realizedPct.toFixed(0)}% IMP` : undefined,
      contextColor: realizedColor,
    },
    {
      label: "OVERALL GEX/CEX",
      value: fmtGex(dealerTotal),
      valueColor: gexColor(dealerTotal),
      value2: fmtGex(dealerCexTotal),
      value2Color: gexColor(dealerCexTotal),
      context:
        dealerTotal === null
          ? undefined
          : dealerTotal >= 0
            ? "POS · OVERALL"
            : "NEG · OVERALL",
    },
    {
      label: "SPOT GEX/CEX",
      value: fmtGex(dealerLocal),
      valueColor: gexColor(dealerLocal),
      value2: fmtGex(dealerCexLocal),
      value2Color: gexColor(dealerCexLocal),
      context: localDiverges
        ? "DIVERGES"
        : dealerLocal === null
          ? undefined
          : "±15PT",
      contextColor: localDiverges ? THEME.amber : THEME.text4,
    },
    // ── Row 2 ──
    {
      label: "IV30",
      value: fmtPct(atmIv),
      context: "ATM",
    },
    {
      label: "SKEW",
      value: fmtNum(skew, 3),
      context: skewPctile !== null ? `${skewPctile}%ILE` : undefined,
      contextColor:
        skewPctile !== null && skewPctile >= 75 ? THEME.amber : THEME.text4,
    },
    {
      label: "VOL RATIO",
      value: fmtNum(vix1dVixRatio),
      valueColor: volRatioColor,
      context: "1D/30D",
    },
    {
      label: "BALANCE STRIKES",
      value: dealerTopPosStrike !== null ? String(dealerTopPosStrike) : "—",
      valueColor: dealerTopPosStrike !== null ? THEME.up : THEME.text4,
      context:
        dealerTopPosValue !== null ? fmtGex(dealerTopPosValue) : undefined,
      contextColor: THEME.up,
    },
    {
      label: "TEST STRIKES",
      value: dealerTopNegStrike !== null ? String(dealerTopNegStrike) : "—",
      valueColor: dealerTopNegStrike !== null ? THEME.down : THEME.text4,
      context:
        dealerTopNegValue !== null ? fmtGex(dealerTopNegValue) : undefined,
      contextColor: THEME.down,
    },
  ];

  return (
    <div className="grid grid-cols-5 border border-border-2">
      {cells.map((cell, idx) => (
        <Cell
          key={cell.label}
          {...cell}
          col={idx % 5}
          row={Math.floor(idx / 5)}
        />
      ))}
    </div>
  );
}
