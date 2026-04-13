/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useRef } from "react";
import * as echarts from "echarts";
import { SessionData } from "../AnalysisDashboard";

type Props = { sessions: SessionData[] };

function classifySession(maxPct: number, eodPct: number): { label: string; color: string } {
  const reversion = maxPct > 0 ? (maxPct - eodPct) / maxPct : 0;
  if (maxPct < 50 && eodPct < 40) return { label: "Quiet drift", color: "#555" };
  if (reversion < 0.25) return { label: "Trending", color: "#f87171" };
  if (reversion < 0.55) return { label: "Partial reversal", color: "#f59e0b" };
  return { label: "Mean-reverting", color: "#9CA9FF" };
}

export default function MaxVsEod({ sessions }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const chart = echarts.init(containerRef.current, null, { renderer: "canvas", height: 300 });
    chartRef.current = chart;
    const handleResize = () => chart.resize();
    window.addEventListener("resize", handleResize);
    return () => { window.removeEventListener("resize", handleResize); chart.dispose(); };
  }, []);

  useEffect(() => {
    if (!chartRef.current) return;

    const maxVal = Math.max(...sessions.map(s => Math.max(s.maxMovePct, s.realizedMovePct))) * 1.15;

    const trendingData = sessions
      .filter(s => classifySession(s.maxMovePct, s.realizedMovePct).label === "Trending")
      .map(s => [parseFloat(s.maxMovePct.toFixed(1)), parseFloat(s.realizedMovePct.toFixed(1)), s.date, s.dayOfWeek]);

    const partialData = sessions
      .filter(s => classifySession(s.maxMovePct, s.realizedMovePct).label === "Partial reversal")
      .map(s => [parseFloat(s.maxMovePct.toFixed(1)), parseFloat(s.realizedMovePct.toFixed(1)), s.date, s.dayOfWeek]);

    const revertingData = sessions
      .filter(s => classifySession(s.maxMovePct, s.realizedMovePct).label === "Mean-reverting")
      .map(s => [parseFloat(s.maxMovePct.toFixed(1)), parseFloat(s.realizedMovePct.toFixed(1)), s.date, s.dayOfWeek]);

    const quietData = sessions
      .filter(s => classifySession(s.maxMovePct, s.realizedMovePct).label === "Quiet drift")
      .map(s => [parseFloat(s.maxMovePct.toFixed(1)), parseFloat(s.realizedMovePct.toFixed(1)), s.date, s.dayOfWeek]);

    const tooltipFmt = (p: any) => {
      const [max, eod, date, day] = p.data;
      const cls = classifySession(max, eod);
      const reversion = max > 0 ? Math.round(((max - eod) / max) * 100) : 0;
      return `<span style="color:#555;font-size:10px">${date} ${day}</span><br/>
              Max <span style="color:#9ca3af">${max}%</span> → EOD <span style="color:#9ca3af">${eod}%</span><br/>
              Reversão <span style="color:#9ca3af">${reversion}%</span><br/>
              <span style="color:${cls.color}">${cls.label}</span>`;
    };

    chartRef.current.setOption({
      backgroundColor: "#111111",
      animation: false,
      grid: { top: 16, bottom: 40, left: 52, right: 16 },
      legend: {
        data: ["Trending", "Partial reversal", "Mean-reverting", "Quiet drift"],
        bottom: 4,
        textStyle: { color: "#555", fontSize: 10 },
        itemWidth: 10,
        itemHeight: 10,
      },
      xAxis: {
        type: "value",
        name: "Max intraday (% implied)",
        nameLocation: "middle",
        nameGap: 28,
        nameTextStyle: { color: "#444", fontSize: 10 },
        min: 0,
        max: parseFloat(maxVal.toFixed(0)),
        axisLine: { lineStyle: { color: "#1f1f1f" } },
        axisTick: { show: false },
        axisLabel: { color: "#666", fontSize: 10, formatter: (v: number) => `${v}%` },
        splitLine: { lineStyle: { color: "#1a1a1a" } },
      },
      yAxis: {
        type: "value",
        name: "EOD realized (% implied)",
        nameLocation: "middle",
        nameGap: 40,
        nameTextStyle: { color: "#444", fontSize: 10 },
        min: 0,
        max: parseFloat(maxVal.toFixed(0)),
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
        formatter: tooltipFmt,
      },
      series: [
        // Diagonal reference line (max = eod = trending)
        {
          type: "line",
          data: [[0, 0], [maxVal, maxVal]],
          lineStyle: { color: "#2a2a2a", width: 1, type: "dashed" },
          symbol: "none",
          silent: true,
          z: 1,
          legendHoverLink: false,
          name: "_diagonal",
          tooltip: { show: false },
        },
        { name: "Trending", type: "scatter", data: trendingData, symbolSize: 8, itemStyle: { color: "#f87171", opacity: 0.85 }, z: 3 },
        { name: "Partial reversal", type: "scatter", data: partialData, symbolSize: 8, itemStyle: { color: "#f59e0b", opacity: 0.85 }, z: 3 },
        { name: "Mean-reverting", type: "scatter", data: revertingData, symbolSize: 8, itemStyle: { color: "#9CA9FF", opacity: 0.85 }, z: 3 },
        { name: "Quiet drift", type: "scatter", data: quietData, symbolSize: 8, itemStyle: { color: "#555", opacity: 0.85 }, z: 3 },
      ],
    });
  }, [sessions]);

  // Summary counts
  const counts = sessions.reduce((acc, s) => {
    const label = classifySession(s.maxMovePct, s.realizedMovePct).label;
    acc[label] = (acc[label] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div>
      <div className="flex gap-4 mb-2">
        {[
          { label: "Trending", color: "#f87171" },
          { label: "Partial reversal", color: "#f59e0b" },
          { label: "Mean-reverting", color: "#9CA9FF" },
          { label: "Quiet drift", color: "#555" },
        ].map(({ label, color }) => (
          <div key={label} className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
            <span className="font-mono text-[11px]" style={{ color }}>
              {counts[label] ?? 0}
            </span>
            <span className="font-sans text-[10px] text-[#444]">{label}</span>
          </div>
        ))}
      </div>
      <div ref={containerRef} className="w-full rounded overflow-hidden" />
    </div>
  );
}
