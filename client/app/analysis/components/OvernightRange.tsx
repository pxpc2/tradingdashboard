/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useRef } from "react";
import * as echarts from "echarts";
import { SessionData } from "../AnalysisDashboard";

type Props = { sessions: SessionData[] };

type RegimeClass = "Trending" | "Partial reversal" | "Mean-reverting" | "Quiet drift";

function classifySession(maxPct: number, eodPct: number): RegimeClass {
  const reversion = maxPct > 0 ? (maxPct - eodPct) / maxPct : 0;
  if (maxPct < 50 && eodPct < 40) return "Quiet drift";
  if (reversion < 0.25) return "Trending";
  if (reversion < 0.55) return "Partial reversal";
  return "Mean-reverting";
}

const CLASS_COLORS: Record<RegimeClass, string> = {
  "Trending": "#f87171",
  "Partial reversal": "#f59e0b",
  "Mean-reverting": "#9CA9FF",
  "Quiet drift": "#555",
};

export default function OvernightRange({ sessions }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);

  const filtered = sessions.filter(s => s.overnightRange !== null && s.overnightRange > 0);

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
      "Trending": [],
      "Partial reversal": [],
      "Mean-reverting": [],
      "Quiet drift": [],
    };

    filtered.forEach(s => {
      const regime = classifySession(s.maxMovePct, s.realizedMovePct);
      byRegime[regime].push([
        parseFloat(s.overnightRange!.toFixed(2)),
        parseFloat(s.realizedMovePct.toFixed(1)),
        s.date,
        s.dayOfWeek,
        regime,
        parseFloat(s.maxMovePct.toFixed(1)),
      ]);
    });

    const ranges = filtered.map(s => s.overnightRange!);
    const maxRange = Math.max(...ranges) * 1.15;

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
        name: "Overnight ES range (pts)",
        nameLocation: "middle",
        nameGap: 28,
        nameTextStyle: { color: "#444", fontSize: 10 },
        min: 0,
        max: parseFloat(maxRange.toFixed(0)),
        axisLine: { lineStyle: { color: "#1f1f1f" } },
        axisTick: { show: false },
        axisLabel: { color: "#666", fontSize: 10 },
        splitLine: { lineStyle: { color: "#1a1a1a" } },
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
          const [range, rv, date, day, regime, maxPct] = p.data;
          return `<span style="color:#555;font-size:10px">${date} ${day}</span><br/>
                  Overnight range <span style="color:#9ca3af">${range}pts</span><br/>
                  RV/IV <span style="color:#9ca3af">${rv}%</span><br/>
                  Max intraday <span style="color:#9ca3af">${maxPct}%</span><br/>
                  <span style="color:${CLASS_COLORS[regime as RegimeClass]}">${regime}</span>`;
        },
      },
      series: (["Trending", "Partial reversal", "Mean-reverting", "Quiet drift"] as RegimeClass[]).map(regime => ({
        name: regime,
        type: "scatter" as const,
        data: byRegime[regime],
        symbolSize: 7,
        itemStyle: { color: CLASS_COLORS[regime], opacity: 0.85 },
        z: 2,
      })),
    });
  }, [filtered]);

  if (filtered.length < 2) {
    return (
      <div className="flex items-center justify-center h-40 text-xs text-[#333]">
        Dados insuficientes — aguardando mais sessões com overnight range
      </div>
    );
  }

  // Quick stats
  const avgRange = filtered.reduce((a, s) => a + s.overnightRange!, 0) / filtered.length;
  const today = filtered[filtered.length - 1];

  return (
    <div>
      <div className="flex gap-4 mb-2">
        <span className="font-sans text-[11px] text-[#555]">
          avg range <span className="font-mono text-[#9ca3af]">{avgRange.toFixed(1)}pts</span>
        </span>
        {today && (
          <span className="font-sans text-[11px] text-[#555]">
            hoje <span className="font-mono text-[#f59e0b]">{today.overnightRange!.toFixed(1)}pts</span>
          </span>
        )}
      </div>
      <div ref={containerRef} className="w-full rounded overflow-hidden" />
    </div>
  );
}
