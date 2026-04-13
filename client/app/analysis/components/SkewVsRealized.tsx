/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useRef } from "react";
import * as echarts from "echarts";
import { SessionData } from "../AnalysisDashboard";

type Props = { sessions: SessionData[] };

type RegimeClass = "Trending" | "Partial reversal" | "Mean-reverting" | "Quiet drift";
type SkewDir = "Rose" | "Flat" | "Fell";

const SKEW_THRESHOLD = 0.005;

function classifySession(maxPct: number, eodPct: number): RegimeClass {
  const reversion = maxPct > 0 ? (maxPct - eodPct) / maxPct : 0;
  if (maxPct < 50 && eodPct < 40) return "Quiet drift";
  if (reversion < 0.25) return "Trending";
  if (reversion < 0.55) return "Partial reversal";
  return "Mean-reverting";
}

function classifySkewChange(change: number): SkewDir {
  if (change > SKEW_THRESHOLD) return "Rose";
  if (change < -SKEW_THRESHOLD) return "Fell";
  return "Flat";
}

const CLASS_COLORS: Record<RegimeClass, string> = {
  "Trending": "#f87171",
  "Partial reversal": "#f59e0b",
  "Mean-reverting": "#9CA9FF",
  "Quiet drift": "#555",
};

// x positions for the three zones
const ZONE_X: Record<SkewDir, number> = { Fell: -1, Flat: 0, Rose: 1 };
const ZONE_LABELS: Record<SkewDir, string> = {
  Fell: "skew caiu (< -0.005)",
  Flat: "skew estável (±0.005)",
  Rose: "skew subiu (> +0.005)",
};

export default function SkewVsRealized({ sessions }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);

  const filtered = sessions.filter(s => s.skewChange !== null && s.maxMovePct > 0);

  useEffect(() => {
    if (!containerRef.current) return;
    const chart = echarts.init(containerRef.current, null, { renderer: "canvas", height: 280 });
    chartRef.current = chart;
    const handleResize = () => chart.resize();
    window.addEventListener("resize", handleResize);
    return () => { window.removeEventListener("resize", handleResize); chart.dispose(); };
  }, []);

  useEffect(() => {
    if (!chartRef.current || filtered.length === 0) return;

    const byRegime: Record<RegimeClass, any[]> = {
      "Trending": [], "Partial reversal": [], "Mean-reverting": [], "Quiet drift": [],
    };

    filtered.forEach(s => {
      const regime = classifySession(s.maxMovePct, s.realizedMovePct);
      const skewDir = classifySkewChange(s.skewChange!);
      const retention = parseFloat(((s.realizedMovePct / s.maxMovePct) * 100).toFixed(1));
      // Jitter slightly within zone so dots don't overlap
      const jitter = (Math.random() - 0.5) * 0.3;
      byRegime[regime].push([
        ZONE_X[skewDir] + jitter,
        retention,
        s.date,
        s.dayOfWeek,
        regime,
        skewDir,
        parseFloat(s.skewChange!.toFixed(4)),
        parseFloat(s.openingSkew?.toFixed(3) ?? "0"),
        parseFloat(s.closingSkew?.toFixed(3) ?? "0"),
      ]);
    });

    chartRef.current.setOption({
      backgroundColor: "#111111",
      animation: false,
      grid: { top: 16, bottom: 48, left: 52, right: 16 },
      legend: {
        data: ["Trending", "Partial reversal", "Mean-reverting", "Quiet drift"],
        bottom: 4,
        textStyle: { color: "#555", fontSize: 10 },
        itemWidth: 10,
        itemHeight: 10,
      },
      xAxis: {
        type: "value",
        min: -1.6,
        max: 1.6,
        axisLine: { lineStyle: { color: "#1f1f1f" } },
        axisTick: { show: false },
        axisLabel: {
          color: "#666",
          fontSize: 10,
          formatter: (v: number) => {
            if (Math.abs(v - (-1)) < 0.1) return "↓ caiu";
            if (Math.abs(v) < 0.1) return "→ flat";
            if (Math.abs(v - 1) < 0.1) return "↑ subiu";
            return "";
          },
          interval: 0,
        },
        splitLine: {
          show: true,
          data: [-1, 0, 1],
          lineStyle: { color: "#1f1f1f", type: "dashed" },
        },
      },
      yAxis: {
        type: "value",
        name: "EOD / max (%)",
        nameLocation: "middle",
        nameGap: 40,
        nameTextStyle: { color: "#444", fontSize: 10 },
        min: 0,
        max: 100,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: "#666", fontSize: 10, formatter: (v: number) => `${v}%` },
        splitLine: { lineStyle: { color: "#1a1a1a" } },
      },
      tooltip: {
        trigger: "item",
        backgroundColor: "#1a1a1a",
        borderColor: "#222",
        padding: [6, 10],
        textStyle: { color: "#9ca3af", fontSize: 11 },
        formatter: (p: any) => {
          if (!Array.isArray(p.data)) return "";
          const [, retention, date, day, regime, skewDir, change, openSkew, closeSkew] = p.data;
          return `<span style="color:#555;font-size:10px">${date} ${day}</span><br/>
                  Skew <span style="color:#9ca3af">${openSkew}</span> → <span style="color:#9ca3af">${closeSkew}</span>
                  <span style="color:#555"> (${change > 0 ? "+" : ""}${change})</span><br/>
                  <span style="color:#555">${ZONE_LABELS[skewDir as SkewDir]}</span><br/>
                  EOD/Max <span style="color:#9ca3af">${retention}%</span><br/>
                  <span style="color:${CLASS_COLORS[regime as RegimeClass]}">${regime}</span>`;
        },
      },
      series: [
        ...(["Trending", "Partial reversal", "Mean-reverting", "Quiet drift"] as RegimeClass[]).map(regime => ({
          name: regime,
          type: "scatter" as const,
          data: byRegime[regime],
          symbolSize: 7,
          itemStyle: { color: CLASS_COLORS[regime], opacity: 0.85 },
          z: 2,
        })),
      ],
    });
  }, [filtered]);

  if (filtered.length < 2) {
    return (
      <div className="flex items-center justify-center h-40 text-xs text-[#333]">
        Dados insuficientes
      </div>
    );
  }

  // Per-zone breakdown
  const zones: Record<SkewDir, { trending: number; reverting: number; total: number }> = {
    Rose: { trending: 0, reverting: 0, total: 0 },
    Flat: { trending: 0, reverting: 0, total: 0 },
    Fell: { trending: 0, reverting: 0, total: 0 },
  };
  filtered.forEach(s => {
    const dir = classifySkewChange(s.skewChange!);
    const regime = classifySession(s.maxMovePct, s.realizedMovePct);
    zones[dir].total++;
    if (regime === "Trending") zones[dir].trending++;
    if (regime === "Mean-reverting") zones[dir].reverting++;
  });

  return (
    <div>
      <div className="flex gap-4 mb-2">
        {(["Fell", "Flat", "Rose"] as SkewDir[]).map(dir => (
          <div key={dir} className="flex items-center gap-1.5 text-[11px]">
            <span className="text-[#444]">{dir === "Rose" ? "↑" : dir === "Fell" ? "↓" : "→"}</span>
            <span className="font-mono text-[#9ca3af]">{zones[dir].total}</span>
            <span className="text-[#444]">dias</span>
            {zones[dir].total > 0 && (
              <span className="text-[#555]">
                ({zones[dir].trending} trend / {zones[dir].reverting} rev)
              </span>
            )}
          </div>
        ))}
      </div>
      <div ref={containerRef} className="w-full rounded overflow-hidden" />
    </div>
  );
}
