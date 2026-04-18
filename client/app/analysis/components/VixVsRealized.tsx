/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useRef } from "react";
import * as echarts from "echarts";
import { SessionData } from "../AnalysisDashboard";

type Props = { sessions: SessionData[] };

type RegimeClass =
  | "Trending"
  | "Partial reversal"
  | "Mean-reverting"
  | "Quiet drift";

function classifySession(maxPct: number, eodPct: number): RegimeClass {
  const reversion = maxPct > 0 ? (maxPct - eodPct) / maxPct : 0;
  if (maxPct < 50 && eodPct < 40) return "Quiet drift";
  if (reversion < 0.25) return "Trending";
  if (reversion < 0.55) return "Partial reversal";
  return "Mean-reverting";
}

const CLASS_COLORS: Record<RegimeClass, string> = {
  Trending: "#f87171",
  "Partial reversal": "#f59e0b",
  "Mean-reverting": "#9CA9FF",
  "Quiet drift": "#555",
};

export default function VixVsRealized({ sessions }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);

  const filtered = sessions.filter(
    (s) => s.vix1dVixRatio !== null && s.maxMovePct > 0,
  );

  useEffect(() => {
    if (!containerRef.current) return;
    const chart = echarts.init(containerRef.current, null, {
      renderer: "canvas",
      height: 280,
    });
    chartRef.current = chart;
    const handleResize = () => chart.resize();
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
      chart.dispose();
    };
  }, []);

  useEffect(() => {
    if (!chartRef.current || filtered.length === 0) return;

    const ratios = filtered.map((s) => s.vix1dVixRatio!);
    const minR = Math.min(...ratios);
    const maxR = Math.max(...ratios);
    const pad = (maxR - minR) * 0.1 || 0.05;

    const byRegime: Record<RegimeClass, any[]> = {
      Trending: [],
      "Partial reversal": [],
      "Mean-reverting": [],
      "Quiet drift": [],
    };

    filtered.forEach((s) => {
      const regime = classifySession(s.maxMovePct, s.realizedMovePct);
      byRegime[regime].push([
        parseFloat(s.vix1dVixRatio!.toFixed(3)),
        parseFloat(s.realizedMovePct.toFixed(1)),
        s.date,
        s.dayOfWeek,
        regime,
        s.openingVix?.toFixed(2) ?? "—",
        s.hasMacro ? "Macro" : "",
      ]);
    });

    chartRef.current.setOption({
      backgroundColor: "#111111",
      animation: false,
      grid: { top: 16, bottom: 64, left: 52, right: 16 },
      legend: {
        data: ["Trending", "Partial reversal", "Mean-reverting", "Quiet drift"],
        bottom: 4,
        textStyle: { color: "#555", fontSize: 10 },
        itemWidth: 10,
        itemHeight: 10,
      },
      xAxis: {
        type: "value",
        name: "VIX1D / VIX ratio",
        nameLocation: "middle",
        nameGap: 28,
        nameTextStyle: { color: "#444", fontSize: 10 },
        min: parseFloat((minR - pad).toFixed(2)),
        max: parseFloat((maxR + pad).toFixed(2)),
        axisLine: { lineStyle: { color: "#1f1f1f" } },
        axisTick: { show: false },
        axisLabel: { color: "#666", fontSize: 10 },
        splitLine: { lineStyle: { color: "#1a1a1a" } },
        // Reference line at 1.0
        markLine: {
          silent: true,
          symbol: "none",
          data: [
            {
              xAxis: 1.0,
              lineStyle: { color: "#2a2a2a", width: 1, type: "dashed" },
            },
          ],
        },
      },
      yAxis: {
        type: "value",
        name: "RV/IV (%)",
        nameLocation: "middle",
        nameGap: 40,
        nameTextStyle: { color: "#444", fontSize: 10 },
        min: 0,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: {
          color: "#666",
          fontSize: 10,
          formatter: (v: number) => `${v}%`,
        },
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
          const [ratio, rv, date, day, regime, vix, macro] = p.data;
          return `<span style="color:#555;font-size:10px">${date} ${day}${macro ? " 📅" : ""}</span><br/>
                  VIX1D/VIX <span style="color:#9ca3af">${ratio}</span>
                  ${vix !== "—" ? `<span style="color:#555"> (VIX ${vix})</span>` : ""}<br/>
                  RV/IV <span style="color:#9ca3af">${rv}%</span><br/>
                  <span style="color:${CLASS_COLORS[regime as RegimeClass]}">${regime}</span>`;
        },
      },
      series: (
        [
          "Trending",
          "Partial reversal",
          "Mean-reverting",
          "Quiet drift",
        ] as RegimeClass[]
      ).map((regime) => ({
        name: regime,
        type: "scatter" as const,
        data: byRegime[regime],
        symbolSize: 7,
        itemStyle: { color: CLASS_COLORS[regime], opacity: 0.85 },
      })),
    });
  }, [filtered]);

  if (filtered.length < 2) {
    return (
      <div className="flex items-center justify-center h-40 text-xs text-[#333]">
        Dados insuficientes — VIX disponível após 2026-04-17
      </div>
    );
  }

  // Summary stats
  const highRatio = filtered.filter((s) => (s.vix1dVixRatio ?? 0) > 1.0);
  const lowRatio = filtered.filter((s) => (s.vix1dVixRatio ?? 1) <= 1.0);
  const avgRvHigh =
    highRatio.length > 0
      ? (
          highRatio.reduce((a, s) => a + s.realizedMovePct, 0) /
          highRatio.length
        ).toFixed(1)
      : null;
  const avgRvLow =
    lowRatio.length > 0
      ? (
          lowRatio.reduce((a, s) => a + s.realizedMovePct, 0) / lowRatio.length
        ).toFixed(1)
      : null;

  return (
    <div>
      <div className="flex gap-4 mb-2 text-[11px]">
        <span className="text-[#555]">
          ratio &gt;1.0 ({highRatio.length} dias)
          {avgRvHigh && (
            <span className="font-mono text-[#f87171] ml-1">
              avg {avgRvHigh}% RV/IV
            </span>
          )}
        </span>
        <span className="text-[#444]">·</span>
        <span className="text-[#555]">
          ratio ≤1.0 ({lowRatio.length} dias)
          {avgRvLow && (
            <span className="font-mono text-[#9CA9FF] ml-1">
              avg {avgRvLow}% RV/IV
            </span>
          )}
        </span>
      </div>
      <div ref={containerRef} className="w-full rounded overflow-hidden" />
    </div>
  );
}
