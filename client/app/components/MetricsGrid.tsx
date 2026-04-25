"use client";

import { THEME } from "../lib/theme";

type Props = {
  straddleMid: number | null;
  openingStraddle: number | null;
  openingSpx: number | null;
  openingPutIv: number | null;
  openingCallIv: number | null;
  openingAtmIv: number | null;
  realizedPts: number | null;
  realizedPct: number | null;
  atmIv: number | null;
  skew: number | null;
  skewPctile: number | null;
  vix1dVixRatio: number | null;
  volRegimeRatio: number | null;
  weeklyImpliedHigh: number | null;
  weeklyImpliedLow: number | null;
  weeklyAtm: number | null;
  weeklyExpiry: string | null;
};

function fmtDollar(v: number | null, d = 2) {
  return v === null ? "—" : `$${v.toFixed(d)}`;
}
function fmtPct(v: number | null, d = 1) {
  return v === null ? "—" : `${(v * 100).toFixed(d)}`;
}
function fmtNum(v: number | null, d = 2) {
  return v === null ? "—" : v.toFixed(d);
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
}: CellSpec & { col: number }) {
  const borderClass = col > 0 ? "border-l border-border-2" : "";
  return (
    <div
      className={`bg-page ${borderClass}`}
      style={{ padding: "6px 8px", minHeight: 58 }}
    >
      <div
        style={{
          fontFamily: "var(--font-sans)",
          fontSize: 10,
          letterSpacing: "0.07em",
          textTransform: "uppercase",
          color: THEME.text4,
          lineHeight: 1,
          marginBottom: 8,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 14,
          fontWeight: 500,
          lineHeight: 1.05,
          color: valueColor ?? THEME.text,
        }}
      >
        {value}
      </div>
      {value2 !== undefined && (
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 14,
            lineHeight: 1.1,
            color: value2Color ?? THEME.text3,
            marginTop: 1,
          }}
        >
          {value2}
        </div>
      )}
      {context && (
        <div
          style={{
            fontFamily: "var(--font-sans)",
            fontSize: 8,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            color: contextColor ?? THEME.text5,
            lineHeight: 1,
            marginTop: 2,
          }}
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
  openingSpx,
  openingPutIv,
  openingCallIv,
  openingAtmIv,
  realizedPts,
  realizedPct,
  atmIv,
  skew,
  skewPctile,
  vix1dVixRatio,
  volRegimeRatio,
  weeklyImpliedHigh,
  weeklyImpliedLow,
  weeklyAtm,
  weeklyExpiry,
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

  // VIX/VIX3M: > 1 = backwardation (stress)
  const volRegimeColor =
    volRegimeRatio === null
      ? THEME.text
      : volRegimeRatio >= 1.0
        ? THEME.amber
        : THEME.text;

  const implUp =
    openingSpx !== null &&
    openingStraddle !== null &&
    openingCallIv !== null &&
    openingAtmIv !== null &&
    openingAtmIv > 0
      ? openingSpx + openingStraddle * (openingCallIv / openingAtmIv)
      : null;

  const implDn =
    openingSpx !== null &&
    openingStraddle !== null &&
    openingPutIv !== null &&
    openingAtmIv !== null &&
    openingAtmIv > 0
      ? openingSpx - openingStraddle * (openingPutIv / openingAtmIv)
      : null;

  const cells: CellSpec[] = [
    {
      label: "STRADDLE MID",
      value: fmtDollar(straddleMid),
      context:
        openingStraddle !== null
          ? `OPENED $${openingStraddle.toFixed(2)}`
          : undefined,
    },
    {
      label: "REALIZED",
      value: realizedPts !== null ? `${realizedPts.toFixed(1)}pt` : "—",
      valueColor: realizedColor,
      context:
        realizedPct !== null
          ? `${realizedPct.toFixed(0)}% OF implied`
          : undefined,
    },
    {
      label: "SKEW",
      value: fmtNum(skew, 3),
      context: skewPctile !== null ? `${skewPctile}%ILE` : undefined,
      contextColor:
        skewPctile !== null && skewPctile >= 75 ? THEME.amber : THEME.text5,
    },
    {
      label: "IV30 · ATM",
      value: fmtPct(atmIv),
      context: "Δ 0",
    },
    {
      label: "VOL RATIO",
      value: fmtNum(vix1dVixRatio),
      valueColor: volRatioColor,
      context: "VIX1D / VIX",
    },
    {
      label: "VOL REGIME",
      value: fmtNum(volRegimeRatio),
      valueColor: volRegimeColor,
      context: "VIX / VIX3M",
    },
    {
      label: "DAILY RANGE",
      value:
        (implUp !== null ? implUp.toFixed(0) : "—") +
        "|" +
        (implDn !== null ? implDn.toFixed(0) : "—"),
      valueColor: THEME.text,
      context: "Skewed by ATM IV",
    },
    {
      label: "WEEKLY RANGE",
      value:
        weeklyImpliedHigh !== null && weeklyImpliedLow !== null
          ? `${weeklyImpliedHigh.toFixed(0)}|${weeklyImpliedLow.toFixed(0)}`
          : "—",
      valueColor: THEME.text,
      context:
        weeklyAtm !== null && weeklyExpiry
          ? `${weeklyExpiry} expiry`
          : "WEEKLY · ±STRADDLE",
    },
  ];

  return (
    <div className="grid grid-cols-8 border border-border-2">
      {cells.map((cell, idx) => (
        <Cell key={cell.label} {...cell} col={idx} />
      ))}
    </div>
  );
}
