"use client";

import { THEME } from "../lib/theme";

type Wall = { strike: number; value: number };

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
  balanceWalls: Wall[];
  testWalls: Wall[];
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

// GEX color — green positive, red negative
function gexColor(v: number | null): string {
  if (v === null) return THEME.text;
  return v >= 0 ? "var(--color-gex-pos)" : "var(--color-gex-neg)";
}

// CEX color — blue positive, mustard negative (VS3D-style)
function cexColor(v: number | null): string {
  if (v === null) return THEME.text;
  return v >= 0 ? "var(--color-cex-pos)" : "var(--color-cex-neg)";
}

// Matching 15%-alpha backgrounds for the pill tags
function gexBgColor(v: number | null): string {
  if (v === null) return "transparent";
  return v >= 0 ? "var(--color-gex-pos-15)" : "var(--color-gex-neg-15)";
}
function cexBgColor(v: number | null): string {
  if (v === null) return "transparent";
  return v >= 0 ? "var(--color-cex-pos-15)" : "var(--color-cex-neg-15)";
}

type CellSpec = {
  label: string;
  value?: string;
  valueColor?: string;
  value2?: string;
  value2Color?: string;
  context?: string;
  contextColor?: string;
  walls?: Wall[];
  wallsColor?: string;
  wallsEmpty?: string;
  dual?: {
    gex: number | null;
    cex: number | null;
    bottomContext?: string;
    bottomContextColor?: string;
  };
};

function DualDealerBody({
  gex,
  cex,
  bottomContext,
  bottomContextColor,
}: {
  gex: number | null;
  cex: number | null;
  bottomContext?: string;
  bottomContextColor?: string;
}) {
  return (
    <>
      <div className="mt-0.5 space-y-0.5">
        <DualRow
          tag="GEX"
          value={fmtGex(gex)}
          color={gexColor(gex)}
          bgColor={gexBgColor(gex)}
        />
        <DualRow
          tag="CEX"
          value={fmtGex(cex)}
          color={cexColor(cex)}
          bgColor={cexBgColor(cex)}
        />
      </div>
      {bottomContext && (
        <div
          className="font-sans text-[9px] uppercase tracking-wide mt-0.5"
          style={{ color: bottomContextColor ?? THEME.text4 }}
        >
          {bottomContext}
        </div>
      )}
    </>
  );
}

function DualRow({
  tag,
  value,
  color,
  bgColor,
}: {
  tag: string;
  value: string;
  color: string;
  bgColor: string;
}) {
  return (
    <div className="flex items-center gap-1.5 leading-tight">
      <span
        className="font-sans text-[9px] px-1 py-px rounded-sm tracking-wide"
        style={{ backgroundColor: bgColor, color }}
      >
        {tag}
      </span>
      <span className="font-mono text-sm font-medium" style={{ color }}>
        {value}
      </span>
    </div>
  );
}

function Cell({
  label,
  value,
  valueColor,
  value2,
  value2Color,
  context,
  contextColor,
  walls,
  wallsColor,
  wallsEmpty,
  dual,
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

      {dual ? (
        <DualDealerBody
          gex={dual.gex}
          cex={dual.cex}
          bottomContext={dual.bottomContext}
          bottomContextColor={dual.bottomContextColor}
        />
      ) : walls ? (
        walls.length === 0 ? (
          <div
            className="font-mono text-base font-medium leading-tight mt-0.5"
            style={{ color: THEME.text4 }}
          >
            {wallsEmpty ?? "—"}
          </div>
        ) : (
          <div className="mt-0.5 space-y-0.5">
            {walls.map((w, i) => (
              <div
                key={w.strike}
                className="flex items-baseline gap-2 leading-tight"
              >
                <span
                  className="font-mono font-medium"
                  style={{
                    color: wallsColor ?? THEME.text,
                    fontSize: i === 0 ? "15px" : "12px",
                  }}
                >
                  {w.strike}
                </span>
                <span
                  className="font-mono"
                  style={{
                    color: wallsColor ?? THEME.text3,
                    fontSize: i === 0 ? "11px" : "10px",
                    opacity: i === 0 ? 1 : 0.75,
                  }}
                >
                  {fmtGex(w.value)}
                </span>
              </div>
            ))}
          </div>
        )
      ) : (
        <>
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
        </>
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
  balanceWalls,
  testWalls,
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

  // Charm direction — derived from local CEX sign.
  // Negative CEX = dealers buying to hedge = BULLISH pressure (amber — matches VS3D)
  // Positive CEX = dealers selling to hedge = BEARISH pressure (blue)
  const isCharmBullish = dealerCexLocal !== null && dealerCexLocal < 0;
  const isCharmBearish = dealerCexLocal !== null && dealerCexLocal > 0;

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
      label: "OVERALL",
      dual: {
        gex: dealerTotal,
        cex: dealerCexTotal,
      },
    },
    {
      label: "SPOT · ±15PT",
      dual: {
        gex: dealerLocal,
        cex: dealerCexLocal,
        bottomContext: isCharmBullish
          ? "BULLISH CHARM"
          : isCharmBearish
            ? "BEARISH CHARM"
            : undefined,
        bottomContextColor: isCharmBullish
          ? "var(--color-cex-neg)"
          : isCharmBearish
            ? "var(--color-cex-pos)"
            : undefined,
      },
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
      walls: balanceWalls,
      wallsColor: "var(--color-wall-balance)",
    },
    {
      label: "TEST STRIKES",
      walls: testWalls,
      wallsColor: "var(--color-wall-test)",
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
