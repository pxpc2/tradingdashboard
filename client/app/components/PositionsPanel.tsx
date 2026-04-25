"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import {
  createChart,
  LineSeries,
  UTCTimestamp,
  IChartApi,
  ISeriesApi,
  SeriesType,
} from "lightweight-charts";
import { FlySnapshot, RtmSession } from "../types";
import { TickData } from "../hooks/useLiveTick";
import { PositionLeg } from "../api/real-positions/route";
import { supabase } from "../lib/supabase";
import { THEME, cssVar, withOpacity } from "../lib/theme";

type Props = {
  smlSession: RtmSession | null;
  flySnapshots: FlySnapshot[];
  realLegs: PositionLeg[];
  realTicks: Record<string, TickData>;
  realIsLoading: boolean;
  realError: string | null;
  /**
   * When provided, renders only that view without the Real↔SML toggle.
   * Used by `PositionsSideBySide` to show both views simultaneously.
   * When omitted, the panel behaves as before (with toggle) for the
   * old `/` route.
   */
  lockedView?: "real" | "sml";
};

const WIDTH_COLORS = THEME.width;

// ─── Trade Grouping ───────────────────────────────────────────────────────────

type TradeStructure =
  | "Naked"
  | "Call Spread"
  | "Put Spread"
  | "Call Butterfly"
  | "Put Butterfly"
  | "Unknown";

type MaxPnl = { maxProfit: number; maxLoss: number };

type TradeGroup = {
  id: string;
  structure: TradeStructure;
  underlyingSymbol: string;
  expiryDate: string;
  optionType: "C" | "P";
  label: string;
  legs: PositionLeg[];
  totalPnl: number | null;
  maxPnl: MaxPnl | null;
  netDelta: number | null;
};

function computeMaxPnl(
  structure: TradeStructure,
  legs: PositionLeg[],
): MaxPnl | null {
  if (structure === "Put Spread" || structure === "Call Spread") {
    const sorted = [...legs].sort((a, b) => a.strike - b.strike);
    const width = sorted[1].strike - sorted[0].strike;
    const qty = sorted[0].quantity;
    const multiplier = sorted[0].multiplier;
    const longLeg = legs.find((l) => l.direction === "Long");
    const shortLeg = legs.find((l) => l.direction === "Short");
    if (!longLeg || !shortLeg) return null;
    const netDebit = longLeg.averageOpenPrice - shortLeg.averageOpenPrice;
    if (netDebit > 0) {
      return {
        maxProfit: (width - netDebit) * qty * multiplier,
        maxLoss: -(netDebit * qty * multiplier),
      };
    } else {
      const netCredit = -netDebit;
      return {
        maxProfit: netCredit * qty * multiplier,
        maxLoss: -((width - netCredit) * qty * multiplier),
      };
    }
  }

  if (structure === "Put Butterfly" || structure === "Call Butterfly") {
    const sorted = [...legs].sort((a, b) => a.strike - b.strike);
    const [low, mid] = sorted;
    const wingQty = low.quantity;
    const multiplier = low.multiplier;
    const width = mid.strike - low.strike;
    let netCostPerUnit = 0;
    for (const leg of legs) {
      const sign = leg.direction === "Long" ? 1 : -1;
      netCostPerUnit += sign * leg.averageOpenPrice * (leg.quantity / wingQty);
    }
    return {
      maxProfit: (width - netCostPerUnit) * wingQty * multiplier,
      maxLoss: -(netCostPerUnit * wingQty * multiplier),
    };
  }

  return null;
}

function computeNetDelta(
  legs: PositionLeg[],
  ticks: Record<string, TickData>,
): number | null {
  let net = 0;
  let hasAny = false;
  for (const leg of legs) {
    const tick = ticks[leg.streamerSymbol] ?? null;
    if (tick?.delta == null) continue;
    const sign = leg.direction === "Long" ? 1 : -1;
    net += sign * tick.delta * leg.quantity;
    hasAny = true;
  }
  return hasAny ? net : null;
}

function groupLegs(
  legs: PositionLeg[],
  ticks: Record<string, TickData>,
): TradeGroup[] {
  if (legs.length === 0) return [];

  const sorted = [...legs].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );

  const clusters: PositionLeg[][] = [];
  let current: PositionLeg[] = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const curr = sorted[i];
    const timeDiff = Math.abs(
      new Date(curr.createdAt).getTime() - new Date(prev.createdAt).getTime(),
    );
    const sameGroup =
      timeDiff <= 10000 &&
      curr.underlyingSymbol === prev.underlyingSymbol &&
      curr.expiryDate === prev.expiryDate &&
      curr.optionType === prev.optionType;

    if (sameGroup) {
      current.push(curr);
    } else {
      clusters.push(current);
      current = [curr];
    }
  }
  clusters.push(current);

  return clusters.map((cluster, idx) => {
    const underlying = cluster[0].underlyingSymbol;
    const expiry = cluster[0].expiryDate;
    const optType = cluster[0].optionType;
    const typeName = optType === "P" ? "Put" : "Call";

    const legPnls = cluster.map((leg) => {
      const tick = ticks[leg.streamerSymbol] ?? null;
      const mid = tick?.mid ?? null;
      if (mid === null || mid === 0) return null;
      const sign = leg.direction === "Long" ? 1 : -1;
      return (
        sign * (mid - leg.averageOpenPrice) * leg.quantity * leg.multiplier
      );
    });

    const allHavePnl = legPnls.every((p) => p !== null);
    const totalPnl = allHavePnl ? legPnls.reduce((a, b) => a! + b!, 0) : null;

    let structure: TradeStructure = "Unknown";
    let label = `${typeName} (${cluster.length} legs)`;

    if (cluster.length === 1) {
      structure = "Naked";
      const leg = cluster[0];
      label = `${leg.strike}${optType} ${typeName}`;
    } else if (cluster.length === 2) {
      const [l0, l1] = [...cluster].sort((a, b) => a.strike - b.strike);
      if (l0.direction !== l1.direction && l0.quantity === l1.quantity) {
        structure = optType === "P" ? "Put Spread" : "Call Spread";
        label = `${l0.strike}/${l1.strike} ${typeName} Spread`;
      }
    } else if (cluster.length === 3) {
      const [low, mid2, high] = [...cluster].sort(
        (a, b) => a.strike - b.strike,
      );
      const symmetric =
        Math.abs(mid2.strike - low.strike - (high.strike - mid2.strike)) < 0.01;
      const centerDouble = Math.abs(mid2.quantity - low.quantity * 2) < 0.01;
      const centerOpp =
        mid2.direction !== low.direction && mid2.direction !== high.direction;
      const wingsMatch = low.direction === high.direction;
      if (symmetric && centerDouble && centerOpp && wingsMatch) {
        structure = optType === "P" ? "Put Butterfly" : "Call Butterfly";
        label = `${low.strike}/${mid2.strike}/${high.strike} ${typeName} Fly`;
      }
    }

    const maxPnl = computeMaxPnl(structure, cluster);
    const netDelta = computeNetDelta(cluster, ticks);

    return {
      id: `group-${idx}`,
      structure,
      underlyingSymbol: underlying,
      expiryDate: expiry,
      optionType: optType,
      label,
      legs: cluster,
      totalPnl: totalPnl ?? null,
      maxPnl,
      netDelta,
    };
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatExpiry(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00Z");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function calcPnl(leg: PositionLeg, tick: TickData | null): number | null {
  const mid = tick?.mid ?? null;
  if (mid === null || mid === 0) return null;
  const sign = leg.direction === "Long" ? 1 : -1;
  return sign * (mid - leg.averageOpenPrice) * leg.quantity * leg.multiplier;
}

function pctOfMax(pnl: number, maxPnl: MaxPnl): string | null {
  if (pnl >= 0 && maxPnl.maxProfit > 0) {
    return `${Math.round((pnl / maxPnl.maxProfit) * 100)}% max`;
  }
  if (pnl < 0 && maxPnl.maxLoss < 0) {
    return `${Math.round((pnl / Math.abs(maxPnl.maxLoss)) * 100)}% max`;
  }
  return null;
}

function formatDelta(delta: number | null | undefined): string {
  if (delta == null) return "—";
  return `${delta >= 0 ? "+" : ""}${delta.toFixed(2)}Δ`;
}

function pnlColor(pnl: number | null): string {
  if (pnl === null) return THEME.text4;
  return pnl >= 0 ? THEME.up : THEME.down;
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function PositionsPanel({
  smlSession,
  flySnapshots,
  realLegs,
  realTicks,
  realIsLoading,
  realError,
  lockedView,
}: Props) {
  const [internalView, setInternalView] = useState<"sml" | "real">("real");
  const [activeWidth, setActiveWidth] = useState<number | null>(null);

  const view = lockedView ?? internalView;

  const widths = smlSession?.widths ?? [];
  const effectiveWidth = activeWidth ?? widths[0] ?? null;

  const widthSnapshots = useMemo(
    () =>
      effectiveWidth !== null
        ? flySnapshots.filter((s) => s.width === effectiveWidth)
        : [],
    [flySnapshots, effectiveWidth],
  );

  const latest = widthSnapshots[widthSnapshots.length - 1] ?? null;
  const entry = widthSnapshots[0] ?? null;
  const pnl = latest && entry ? latest.mid - entry.mid : null;
  const hasSession = smlSession?.sml_ref != null;

  const groups = useMemo(
    () => groupLegs(realLegs, realTicks),
    [realLegs, realTicks],
  );

  const totalRealPnl = useMemo(() => {
    if (groups.length === 0) return null;
    let total = 0;
    let hasAny = false;
    for (const g of groups) {
      if (g.totalPnl !== null) {
        total += g.totalPnl;
        hasAny = true;
      }
    }
    return hasAny ? total : null;
  }, [groups]);

  const headerTitle =
    lockedView === "real"
      ? "Real Positions"
      : lockedView === "sml"
        ? "SML Fly"
        : "Posições";

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center mb-2">
        <span className="font-sans text-xs text-text-4 uppercase tracking-wide">
          {headerTitle}
        </span>
        {!lockedView && (
          <div className="ml-auto flex gap-3 text-xs">
            <button
              onClick={() => setInternalView("real")}
              className={`transition-colors hover:cursor-pointer ${view === "real" ? "text-text-3 border-b border-text-4" : "text-text-5"}`}
            >
              Real
            </button>
            <button
              onClick={() => setInternalView("sml")}
              className={`transition-colors hover:cursor-pointer ${view === "sml" ? "text-text-3 border-b border-text-4" : "text-text-5"}`}
            >
              SML Fly
            </button>
          </div>
        )}
      </div>

      {view === "sml" ? (
        hasSession ? (
          <div className="flex-1 flex flex-col">
            {widths.length > 1 && (
              <div className="flex gap-3 mb-2">
                {widths.map((w) => (
                  <button
                    key={w}
                    onClick={() => setActiveWidth(w)}
                    className={`font-mono text-xs px-2 py-0.5 transition-colors hover:cursor-pointer ${effectiveWidth === w ? "text-text-3 border-b border-text-4" : "text-text-5"}`}
                  >
                    {w}W
                  </button>
                ))}
              </div>
            )}
            <div className="flex gap-3 text-xs mb-2">
              <span className="text-text-4">{effectiveWidth}W</span>
              <span>
                <span className="text-text-4">ENTRY</span>{" "}
                <span className="font-mono text-text-2">
                  {entry?.mid.toFixed(2) ?? "—"}
                </span>
              </span>
              <span>
                <span className="text-text-4">MID NOW</span>{" "}
                <span className="font-mono text-text-2">
                  {latest?.mid.toFixed(2) ?? "—"}
                </span>
              </span>
              <span className="font-mono" style={{ color: pnlColor(pnl) }}>
                PNL{" "}
                {pnl !== null ? `${pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}` : "—"}
              </span>
            </div>
            <div className="flex-1 min-h-[80px] bg-panel rounded overflow-hidden">
              {widthSnapshots.length > 0 && effectiveWidth !== null ? (
                <FlyMiniChart data={widthSnapshots} widthKey={effectiveWidth} />
              ) : (
                <div className="h-full flex items-center justify-center text-xs text-text-6">
                  Waiting for data...
                </div>
              )}
            </div>
          </div>
        ) : (
          <SmlInputForm />
        )
      ) : (
        <RealPositionsView
          groups={groups}
          ticks={realTicks}
          isLoading={realIsLoading}
          error={realError}
          totalPnl={totalRealPnl}
        />
      )}
    </div>
  );
}

// ─── Real Positions View ──────────────────────────────────────────────────────

function RealPositionsView({
  groups,
  ticks,
  isLoading,
  error,
  totalPnl,
}: {
  groups: TradeGroup[];
  ticks: Record<string, TickData>;
  isLoading: boolean;
  error: string | null;
  totalPnl: number | null;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }

  if (isLoading && groups.length === 0)
    return (
      <div className="flex-1 flex items-center justify-center text-xs text-text-6">
        Carregando...
      </div>
    );
  if (error)
    return (
      <div
        className="flex-1 flex items-center justify-center text-xs"
        style={{ color: THEME.down }}
      >
        {error}
      </div>
    );
  if (groups.length === 0)
    return (
      <div className="flex-1 flex items-center justify-center text-xs text-text-6 uppercase tracking-wide">
        Sem posições abertas
      </div>
    );

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {totalPnl !== null && (
        <div className="flex items-center justify-between mb-2">
          <span className="font-sans text-[11px] text-text-4 uppercase tracking-wide">
            Total P&L
          </span>
          <span
            className="font-mono text-base"
            style={{ color: pnlColor(totalPnl) }}
          >
            {totalPnl >= 0 ? "+" : ""}${totalPnl.toFixed(2)}
          </span>
        </div>
      )}

      <div className="flex-1 overflow-y-auto space-y-1.5 pr-0.5">
        {groups.map((group) => {
          if (group.structure === "Unknown") {
            return group.legs.map((leg) => {
              const tick = ticks[leg.streamerSymbol] ?? null;
              const mid = tick?.mid ?? null;
              const legPnl = calcPnl(leg, tick);
              const legDelta =
                tick?.delta != null
                  ? (leg.direction === "Long" ? 1 : -1) *
                    tick.delta *
                    leg.quantity
                  : null;
              return (
                <div
                  key={leg.symbol}
                  className="bg-panel rounded px-2 py-1.5 flex items-center gap-2"
                >
                  <div
                    className="w-0.5 h-5 shrink-0"
                    style={{
                      backgroundColor:
                        leg.direction === "Long" ? THEME.up : THEME.down,
                    }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="font-mono text-sm text-text-2">
                      {leg.strike}
                      {leg.optionType}{" "}
                      <span className="text-xs text-text-4">
                        {formatExpiry(leg.expiryDate)}
                      </span>
                    </div>
                    <div className="font-sans text-[10px] text-text-5 uppercase">
                      {leg.direction} {leg.quantity} × {leg.underlyingSymbol}
                      {legDelta !== null && (
                        <span className="ml-2 text-text-4">
                          {formatDelta(legDelta)}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-mono text-xs text-text-2">
                      {mid !== null ? mid.toFixed(2) : "—"}
                      <span className="text-text-5 ml-1">
                        / {leg.averageOpenPrice.toFixed(2)}
                      </span>
                    </div>
                    <div
                      className="font-mono text-xs"
                      style={{ color: pnlColor(legPnl) }}
                    >
                      {legPnl !== null
                        ? `${legPnl >= 0 ? "+" : ""}$${legPnl.toFixed(2)}`
                        : "—"}
                    </div>
                  </div>
                </div>
              );
            });
          }

          const isExp = expanded.has(group.id);
          const pctMax =
            group.totalPnl !== null && group.maxPnl
              ? pctOfMax(group.totalPnl, group.maxPnl)
              : null;

          return (
            <div key={group.id} className="bg-panel rounded overflow-hidden">
              <div
                className="px-2 py-1.5 flex items-center gap-2 cursor-pointer hover:bg-panel-2 transition-colors"
                onClick={() => toggleExpand(group.id)}
              >
                <div className="w-0.5 h-5 shrink-0 bg-border-2" />
                <div className="flex-1 min-w-0">
                  <div className="font-mono text-sm text-text-2">
                    {group.label}
                  </div>
                  <div className="font-sans text-[10px] text-text-5 uppercase flex gap-2">
                    <span>
                      {formatExpiry(group.expiryDate)} ·{" "}
                      {group.underlyingSymbol}
                    </span>
                    {group.netDelta !== null && (
                      <span className="text-text-4">
                        {formatDelta(group.netDelta)}
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-right shrink-0 flex items-center gap-2">
                  <div>
                    <div
                      className="font-mono text-xs"
                      style={{ color: pnlColor(group.totalPnl) }}
                    >
                      {group.totalPnl !== null
                        ? `${group.totalPnl >= 0 ? "+" : ""}$${group.totalPnl.toFixed(2)}`
                        : "—"}
                    </div>
                    {pctMax && (
                      <div className="font-mono text-[10px] text-text-5">
                        {pctMax}
                      </div>
                    )}
                  </div>
                  <span className="text-text-6 text-[10px]">
                    {isExp ? "▲" : "▼"}
                  </span>
                </div>
              </div>

              {isExp && group.maxPnl && (
                <div className="px-2 py-1.5 border-t border-border flex gap-4">
                  <div>
                    <div className="font-sans text-[10px] text-text-5 uppercase">
                      Max profit
                    </div>
                    <div
                      className="font-mono text-xs"
                      style={{ color: THEME.up }}
                    >
                      +${group.maxPnl.maxProfit.toFixed(2)}
                    </div>
                  </div>
                  <div>
                    <div className="font-sans text-[10px] text-text-5 uppercase">
                      Max loss
                    </div>
                    <div
                      className="font-mono text-xs"
                      style={{ color: THEME.down }}
                    >
                      -${Math.abs(group.maxPnl.maxLoss).toFixed(2)}
                    </div>
                  </div>
                  {group.netDelta !== null && (
                    <div>
                      <div className="font-sans text-[10px] text-text-5 uppercase">
                        Net Δ
                      </div>
                      <div className="font-mono text-xs text-text-2">
                        {formatDelta(group.netDelta)}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {isExp &&
                group.legs.map((leg) => {
                  const tick = ticks[leg.streamerSymbol] ?? null;
                  const mid = tick?.mid ?? null;
                  const legPnl = calcPnl(leg, tick);
                  const legDelta =
                    tick?.delta != null
                      ? (leg.direction === "Long" ? 1 : -1) *
                        tick.delta *
                        leg.quantity
                      : null;
                  return (
                    <div
                      key={leg.symbol}
                      className="px-2 py-1.5 flex items-center gap-2 border-t border-border"
                    >
                      <div
                        className="w-0.5 h-4 shrink-0"
                        style={{
                          backgroundColor:
                            leg.direction === "Long"
                              ? withOpacity(THEME.up, 0.4)
                              : withOpacity(THEME.down, 0.4),
                        }}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="font-mono text-xs text-text-3">
                          {leg.strike}
                          {leg.optionType}
                          <span className="text-text-5 ml-1">
                            {leg.direction} {leg.quantity}
                          </span>
                        </div>
                        {legDelta !== null && (
                          <div className="font-mono text-[10px] text-text-4">
                            {formatDelta(legDelta)}
                          </div>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <div className="font-mono text-xs text-text-3">
                          {mid !== null ? mid.toFixed(2) : "—"}
                          <span className="text-text-5 ml-1">
                            / {leg.averageOpenPrice.toFixed(2)}
                          </span>
                        </div>
                        <div
                          className="font-mono text-[11px]"
                          style={{ color: pnlColor(legPnl) }}
                        >
                          {legPnl !== null
                            ? `${legPnl >= 0 ? "+" : ""}$${legPnl.toFixed(2)}`
                            : "—"}
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Fly Mini Chart ───────────────────────────────────────────────────────────

/**
 * CT formatter used by the lightweight-charts time axis and tooltip.
 * Supabase stores timestamps in UTC; without these formatters the axis
 * ticks and crosshair label would display UTC, breaking consistency with
 * the rest of the dashboard which is CT-native.
 */
function formatAxisTickCt(time: unknown): string {
  if (typeof time !== "number") return "";
  const date = new Date(time * 1000);
  return date.toLocaleTimeString("en-US", {
    timeZone: "America/Chicago",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function formatTooltipCt(time: unknown): string {
  if (typeof time !== "number") return "";
  const date = new Date(time * 1000);
  const datePart = date.toLocaleDateString("en-US", {
    timeZone: "America/Chicago",
    month: "short",
    day: "numeric",
  });
  const timePart = date.toLocaleTimeString("en-US", {
    timeZone: "America/Chicago",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  return `${datePart} ${timePart} CT`;
}

function FlyMiniChart({
  data,
  widthKey,
}: {
  data: FlySnapshot[];
  widthKey: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<SeriesType> | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const panel = cssVar("--color-panel", "#121214");
    const border = cssVar("--color-border", "#1f1f21");
    const text5 = cssVar("--color-text-5", "#44433F");
    const text6 = cssVar("--color-text-6", "#2F2E2C");
    const lineColor = cssVar(`--color-width-${widthKey}`, "#9B7BB3");

    const chart = createChart(containerRef.current, {
      layout: { background: { color: panel }, textColor: text5 },
      grid: {
        vertLines: { visible: false },
        horzLines: { color: border },
      },
      crosshair: {
        vertLine: { color: text6 },
        horzLine: { color: text6 },
      },
      rightPriceScale: {
        borderColor: border,
        scaleMargins: { top: 0.1, bottom: 0.1 },
      },
      timeScale: {
        borderColor: border,
        timeVisible: true,
        secondsVisible: false,
        tickMarkFormatter: formatAxisTickCt,
      },
      localization: {
        timeFormatter: formatTooltipCt,
      },
      width: containerRef.current.clientWidth,
      height: containerRef.current.clientHeight,
    });
    const series = chart.addSeries(LineSeries, {
      color: lineColor,
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: true,
    });
    series.createPriceLine({
      price: 0,
      color: text6,
      lineWidth: 1,
      lineStyle: 2,
      axisLabelVisible: false,
    });
    chartRef.current = chart;
    seriesRef.current = series;
    const handleResize = () => {
      if (containerRef.current)
        chart.applyOptions({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight,
        });
    };
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
      chart.remove();
    };
  }, [widthKey]);

  useEffect(() => {
    if (!seriesRef.current || !chartRef.current) return;
    const points = data
      .map((s) => ({
        time: Math.floor(
          new Date(s.created_at).getTime() / 1000,
        ) as UTCTimestamp,
        value: s.mid,
      }))
      .filter((p, i, arr) => i === 0 || p.time > arr[i - 1].time);
    seriesRef.current.setData(points);
    try {
      chartRef.current.timeScale().fitContent();
    } catch {}
  }, [data]);

  return <div ref={containerRef} className="w-full h-full" />;
}

// ─── SML Input Form ───────────────────────────────────────────────────────────

function SmlInputForm() {
  const [smlRef, setSmlRef] = useState("");
  const [widths, setWidths] = useState<number[]>([15, 20]);
  const [optType, setOptType] = useState<"put" | "call">("put");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const toggleWidth = (w: number) => {
    if (widths.includes(w)) setWidths(widths.filter((x) => x !== w));
    else setWidths([...widths, w].sort((a, b) => a - b));
  };

  const handleSubmit = async () => {
    const ref = parseFloat(smlRef);
    if (isNaN(ref) || widths.length === 0) return;
    setIsSubmitting(true);
    try {
      await supabase
        .from("rtm_sessions")
        .insert({ sml_ref: ref, widths, type: optType });
    } catch (err) {
      console.error("Failed to create session:", err);
    }
    setIsSubmitting(false);
  };

  return (
    <div className="flex-1 bg-panel rounded p-3 flex flex-col gap-3">
      <div className="text-xs text-text-4 uppercase tracking-wide">
        adicionar sml fly do dia
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs text-text-4 w-12">SML</span>
        <input
          type="number"
          value={smlRef}
          onChange={(e) => setSmlRef(e.target.value)}
          placeholder="6815"
          className="flex-1 bg-page border border-border rounded px-2 py-1 font-mono text-sm text-text-2 placeholder-text-6 focus:border-text-5 focus:outline-none"
        />
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs text-text-4 w-12">Width</span>
        <div className="flex gap-1.5">
          {[10, 15, 20, 25, 30].map((w) => (
            <button
              key={w}
              onClick={() => toggleWidth(w)}
              className={`font-mono text-xs px-2 py-0.5 rounded transition-colors hover:cursor-pointer ${widths.includes(w) ? "bg-border-2 text-text-2" : "bg-transparent text-text-5 border border-border"}`}
            >
              {w}
            </button>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs text-text-4 w-12">Type</span>
        <div className="flex gap-1.5">
          {(["put", "call"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setOptType(t)}
              className={`text-xs px-2 py-0.5 rounded transition-colors hover:cursor-pointer ${optType === t ? "bg-border-2 text-text-2" : "bg-transparent text-text-5 border border-border"}`}
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
      </div>
      <button
        onClick={handleSubmit}
        disabled={isSubmitting || !smlRef || widths.length === 0}
        className="mt-auto bg-border-2 text-xs text-text-2 py-1.5 rounded hover:bg-border-2 hover:text-text transition-colors disabled:opacity-50 disabled:cursor-not-allowed hover:cursor-pointer"
      >
        {isSubmitting ? "Criando..." : "Iniciar"}
      </button>
    </div>
  );
}
