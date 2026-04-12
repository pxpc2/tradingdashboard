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

type Props = {
  smlSession: RtmSession | null;
  flySnapshots: FlySnapshot[];
  // Real positions
  realLegs: PositionLeg[];
  realTicks: Record<string, TickData>;
  realIsLoading: boolean;
  realError: string | null;
};

const WIDTH_COLORS: Record<number, string> = {
  10: "#60a5fa",
  15: "#9CA9FF",
  20: "#fb923c",
  25: "#34d399",
  30: "#f472b6",
};

function formatExpiry(dateStr: string): string {
  // "2026-04-17" → "Apr 17"
  const d = new Date(dateStr + "T12:00:00Z");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function calcPnl(leg: PositionLeg, tick: TickData | null): number | null {
  const mid = tick?.mid ?? null;
  if (mid === null || mid === 0) return null;
  const sign = leg.direction === "Long" ? 1 : -1;
  return sign * (mid - leg.averageOpenPrice) * leg.quantity * leg.multiplier;
}

export default function PositionsPanel({
  smlSession,
  flySnapshots,
  realLegs,
  realTicks,
  realIsLoading,
  realError,
}: Props) {
  const [view, setView] = useState<"sml" | "real">("real");
  const [activeWidth, setActiveWidth] = useState<number | null>(null);

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
  const color =
    effectiveWidth !== null ? (WIDTH_COLORS[effectiveWidth] ?? "#888") : "#888";

  const hasSession = smlSession?.sml_ref != null;

  // Total real P&L
  const totalRealPnl = useMemo(() => {
    if (realLegs.length === 0) return null;
    let total = 0;
    let hasAny = false;
    for (const leg of realLegs) {
      const tick = realTicks[leg.streamerSymbol] ?? null;
      const p = calcPnl(leg, tick);
      if (p !== null) {
        total += p;
        hasAny = true;
      }
    }
    return hasAny ? total : null;
  }, [realLegs, realTicks]);

  return (
    <div className="h-full flex flex-col">
      {/* Header with toggle */}
      <div className="flex items-center mb-2">
        <span className="font-sans text-xs text-[#555] uppercase tracking-wide">
          Posições
        </span>
        <div className="ml-auto flex gap-3 text-xs">
          <button
            onClick={() => setView("real")}
            className={`transition-colors hover:cursor-pointer ${
              view === "real"
                ? "text-[#888] border-b border-[#555]"
                : "text-[#444]"
            }`}
          >
            Real
          </button>
          <button
            onClick={() => setView("sml")}
            className={`transition-colors hover:cursor-pointer ${
              view === "sml"
                ? "text-[#888] border-b border-[#555]"
                : "text-[#444]"
            }`}
          >
            SML Fly
          </button>
        </div>
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
                    className={`font-mono text-xs px-2 py-0.5 transition-colors hover:cursor-pointer ${
                      effectiveWidth === w
                        ? "text-[#888] border-b border-[#555]"
                        : "text-[#444]"
                    }`}
                  >
                    {w}W
                  </button>
                ))}
              </div>
            )}

            <div className="flex gap-3 text-xs mb-2">
              <span className="text-[#555]">{effectiveWidth}W</span>
              <span>
                <span className="text-[#555]">ENT</span>{" "}
                <span className="font-mono text-[#9ca3af]">
                  {entry?.mid.toFixed(2) ?? "—"}
                </span>
              </span>
              <span>
                <span className="text-[#555]">MID</span>{" "}
                <span className="font-mono text-[#9ca3af]">
                  {latest?.mid.toFixed(2) ?? "—"}
                </span>
              </span>
              <span
                className="font-mono"
                style={{
                  color:
                    pnl === null ? "#555" : pnl >= 0 ? "#4ade80" : "#f87171",
                }}
              >
                {pnl !== null ? `${pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}` : "—"}
              </span>
            </div>

            <div className="flex-1 min-h-[80px] bg-[#111] rounded overflow-hidden">
              {widthSnapshots.length > 0 && effectiveWidth !== null ? (
                <FlyMiniChart data={widthSnapshots} color={color} />
              ) : (
                <div className="h-full flex items-center justify-center text-xs text-[#333]">
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
          legs={realLegs}
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
  legs,
  ticks,
  isLoading,
  error,
  totalPnl,
}: {
  legs: PositionLeg[];
  ticks: Record<string, TickData>;
  isLoading: boolean;
  error: string | null;
  totalPnl: number | null;
}) {
  if (isLoading && legs.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-xs text-[#333]">
        Carregando...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center text-xs text-[#f87171]">
        {error}
      </div>
    );
  }

  if (legs.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-xs text-[#333] uppercase tracking-wide">
        Sem posições abertas
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Total P&L */}
      {totalPnl !== null && (
        <div className="flex items-center justify-between mb-2">
          <span className="font-sans text-[11px] text-[#555] uppercase tracking-wide">
            Total P&L
          </span>
          <span
            className="font-mono text-base"
            style={{ color: totalPnl >= 0 ? "#4ade80" : "#f87171" }}
          >
            {totalPnl >= 0 ? "+" : ""}${totalPnl.toFixed(0)}
          </span>
        </div>
      )}

      {/* Legs list */}
      <div className="flex-1 overflow-y-auto space-y-1.5 pr-0.5">
        {legs.map((leg) => {
          const tick = ticks[leg.streamerSymbol] ?? null;
          const mid = tick?.mid ?? null;
          const legPnl = calcPnl(leg, tick);
          const pnlColor =
            legPnl === null ? "#555" : legPnl >= 0 ? "#4ade80" : "#f87171";

          return (
            <div
              key={leg.symbol}
              className="bg-[#111] rounded px-2 py-1.5 flex items-center gap-2"
            >
              {/* Direction indicator */}
              <div
                className="w-0.5 h-5 shrink-0"
                style={{
                  backgroundColor:
                    leg.direction === "Long" ? "#4ade80" : "#f87171",
                }}
              />

              {/* Strike + expiry + type */}
              <div className="flex-1 min-w-0">
                <div className="font-mono text-sm text-[#9ca3af]">
                  {leg.strike.toFixed(0)}
                  {leg.optionType}{" "}
                  <span className="text-xs text-[#555]">
                    {formatExpiry(leg.expiryDate)}
                  </span>
                </div>
                <div className="font-sans text-[10px] text-[#444] uppercase">
                  {leg.direction} {leg.quantity} × {leg.underlyingSymbol}
                </div>
              </div>

              {/* Mid + entry + P&L */}
              <div className="text-right shrink-0">
                <div className="font-mono text-xs text-[#9ca3af]">
                  {mid !== null ? mid.toFixed(2) : "—"}
                  <span className="text-[#444] ml-1">
                    / {leg.averageOpenPrice.toFixed(2)}
                  </span>
                </div>
                <div className="font-mono text-xs" style={{ color: pnlColor }}>
                  {legPnl !== null
                    ? `${legPnl >= 0 ? "+" : ""}$${legPnl.toFixed(0)}`
                    : "—"}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Fly Mini Chart ───────────────────────────────────────────────────────────

function FlyMiniChart({ data, color }: { data: FlySnapshot[]; color: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<SeriesType> | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: { background: { color: "#111111" }, textColor: "#444444" },
      grid: { vertLines: { visible: false }, horzLines: { color: "#1a1a1a" } },
      crosshair: {
        vertLine: { color: "#333333" },
        horzLine: { color: "#333333" },
      },
      rightPriceScale: {
        borderColor: "#1f1f1f",
        scaleMargins: { top: 0.1, bottom: 0.1 },
      },
      timeScale: {
        borderColor: "#1f1f1f",
        timeVisible: true,
        secondsVisible: false,
      },
      width: containerRef.current.clientWidth,
      height: containerRef.current.clientHeight,
    });

    const series = chart.addSeries(LineSeries, {
      color,
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: true,
    });

    series.createPriceLine({
      price: 0,
      color: "#333",
      lineWidth: 1,
      lineStyle: 2,
      axisLabelVisible: false,
    });

    chartRef.current = chart;
    seriesRef.current = series;

    const handleResize = () => {
      if (containerRef.current) {
        chart.applyOptions({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight,
        });
      }
    };
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      chart.remove();
    };
  }, [color]);

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
    if (widths.includes(w)) {
      setWidths(widths.filter((x) => x !== w));
    } else {
      setWidths([...widths, w].sort((a, b) => a - b));
    }
  };

  const handleSubmit = async () => {
    const ref = parseFloat(smlRef);
    if (isNaN(ref) || widths.length === 0) return;
    setIsSubmitting(true);
    try {
      await supabase.from("rtm_sessions").insert({
        sml_ref: ref,
        widths,
        type: optType,
      });
    } catch (err) {
      console.error("Failed to create session:", err);
    }
    setIsSubmitting(false);
  };

  return (
    <div className="flex-1 bg-[#111] rounded p-3 flex flex-col gap-3">
      <div className="text-xs text-[#555] uppercase tracking-wide">
        adicionar sml fly do dia
      </div>

      <div className="flex items-center gap-2">
        <span className="text-xs text-[#555] w-12">SML</span>
        <input
          type="number"
          value={smlRef}
          onChange={(e) => setSmlRef(e.target.value)}
          placeholder="6815"
          className="flex-1 bg-[#0a0a0a] border border-[#222] rounded px-2 py-1 font-mono text-sm text-[#9ca3af] placeholder-[#333] focus:border-[#444] focus:outline-none"
        />
      </div>

      <div className="flex items-center gap-2">
        <span className="text-xs text-[#555] w-12">Width</span>
        <div className="flex gap-1.5">
          {[10, 15, 20, 25, 30].map((w) => (
            <button
              key={w}
              onClick={() => toggleWidth(w)}
              className={`font-mono text-xs px-2 py-0.5 rounded transition-colors hover:cursor-pointer ${
                widths.includes(w)
                  ? "bg-[#222] text-[#9ca3af]"
                  : "bg-transparent text-[#444] border border-[#222]"
              }`}
            >
              {w}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-xs text-[#555] w-12">Type</span>
        <div className="flex gap-1.5">
          {(["put", "call"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setOptType(t)}
              className={`text-xs px-2 py-0.5 rounded transition-colors hover:cursor-pointer ${
                optType === t
                  ? "bg-[#222] text-[#9ca3af]"
                  : "bg-transparent text-[#444] border border-[#222]"
              }`}
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <button
        onClick={handleSubmit}
        disabled={isSubmitting || !smlRef || widths.length === 0}
        className="mt-auto bg-[#222] text-xs text-[#9ca3af] py-1.5 rounded hover:bg-[#2a2a2a] transition-colors disabled:opacity-50 disabled:cursor-not-allowed hover:cursor-pointer"
      >
        {isSubmitting ? "Criando..." : "Iniciar"}
      </button>
    </div>
  );
}
