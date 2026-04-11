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
import { supabase } from "../lib/supabase";

type Props = {
  smlSession: RtmSession | null;
  flySnapshots: FlySnapshot[];
};

const WIDTH_COLORS: Record<number, string> = {
  10: "#60a5fa",
  15: "#9CA9FF",
  20: "#fb923c",
  25: "#34d399",
  30: "#f472b6",
};

export default function PositionsPanel({ smlSession, flySnapshots }: Props) {
  const [view, setView] = useState<"sml" | "real">("sml");
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

  return (
    <div className="h-full flex flex-col">
      {/* Header with toggle */}
      <div className="flex items-center mb-2">
        <span className="font-sans text-xs text-[#555] uppercase tracking-wide">
          Posições
        </span>
        <div className="ml-auto flex gap-3 text-xs">
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
        </div>
      </div>

      {view === "sml" ? (
        hasSession ? (
          <div className="flex-1 flex flex-col">
            {/* Width tabs */}
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

            {/* Metrics row */}
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

            {/* Lightweight Chart */}
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
        <div className="flex-1 bg-[#111] rounded flex items-center justify-center text-xs text-[#333] uppercase tracking-wide">
          Posições Tastytrade — em breve
        </div>
      )}
    </div>
  );
}

// Lightweight Charts mini chart for fly data
function FlyMiniChart({ data, color }: { data: FlySnapshot[]; color: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<SeriesType> | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { color: "#111111" },
        textColor: "#444444",
      },
      grid: {
        vertLines: { visible: false },
        horzLines: { color: "#1a1a1a" },
      },
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
      color: color,
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: true,
    });

    // Add zero line
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

// SML Input Form when no session exists
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
        widths: widths,
        type: optType,
      });
      // Session will appear via realtime subscription
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

      {/* SML Reference */}
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

      {/* Widths */}
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

      {/* Type */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-[#555] w-12">Type</span>
        <div className="flex gap-1.5">
          <button
            onClick={() => setOptType("put")}
            className={`text-xs px-2 py-0.5 rounded transition-colors hover:cursor-pointer ${
              optType === "put"
                ? "bg-[#222] text-[#9ca3af]"
                : "bg-transparent text-[#444] border border-[#222]"
            }`}
          >
            Put
          </button>
          <button
            onClick={() => setOptType("call")}
            className={`text-xs px-2 py-0.5 rounded transition-colors hover:cursor-pointer ${
              optType === "call"
                ? "bg-[#222] text-[#9ca3af]"
                : "bg-transparent text-[#444] border border-[#222]"
            }`}
          >
            Call
          </button>
        </div>
      </div>

      {/* Submit */}
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
