/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useRef, useMemo } from "react";
import * as echarts from "echarts";
import { SessionData } from "../AnalysisDashboard";

type Props = { sessions: SessionData[] };

const DAY_ORDER = ["Mon", "Tue", "Wed", "Thu", "Fri"];

export default function DayOfWeekBreakdown({ sessions }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);

  const byDay = useMemo(() => {
    const map: Record<string, number[]> = { Mon: [], Tue: [], Wed: [], Thu: [], Fri: [] };
    for (const s of sessions) {
      const day = s.dayOfWeek;
      if (map[day]) map[day].push(s.realizedMovePct);
    }
    return DAY_ORDER.map(day => {
      const vals = map[day];
      const avg = vals.length > 0
        ? parseFloat((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1))
        : null;
      return { day, avg, count: vals.length, vals };
    });
  }, [sessions]);

  useEffect(() => {
    if (!containerRef.current) return;
    const chart = echarts.init(containerRef.current, null, { renderer: "canvas", height: 220 });
    chartRef.current = chart;
    const handleResize = () => chart.resize();
    window.addEventListener("resize", handleResize);
    return () => { window.removeEventListener("resize", handleResize); chart.dispose(); };
  }, []);

  useEffect(() => {
    if (!chartRef.current) return;

    const overallAvg = sessions.length > 0
      ? sessions.reduce((a, s) => a + s.realizedMovePct, 0) / sessions.length
      : 0;

    chartRef.current.setOption({
      backgroundColor: "#111111",
      animation: false,
      grid: { top: 24, bottom: 32, left: 48, right: 16 },
      xAxis: {
        type: "category",
        data: byDay.map(d => d.day),
        axisLine: { lineStyle: { color: "#1f1f1f" } },
        axisTick: { show: false },
        axisLabel: { color: "#666", fontSize: 11 },
        splitLine: { show: false },
      },
      yAxis: {
        type: "value",
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: "#666", fontSize: 10, formatter: (v: number) => `${v}%` },
        splitLine: { lineStyle: { color: "#1a1a1a" } },
      },
      tooltip: {
        trigger: "axis",
        backgroundColor: "#1a1a1a",
        borderColor: "#222",
        padding: [6, 10],
        textStyle: { color: "#9ca3af", fontSize: 11 },
        formatter: (params: any) => {
          const p = Array.isArray(params) ? params[0] : params;
          const d = byDay[p.dataIndex];
          if (!d.avg) return `${d.day}<br/><span style="color:#555">sem dados</span>`;
          return `<span style="color:#555">${d.day}</span> <span style="color:#444">(${d.count} sessões)</span><br/>
                  Avg RV/IV <span style="color:#9ca3af">${d.avg.toFixed(1)}%</span><br/>
                  <span style="color:#444;font-size:10px">valores: ${d.vals.map(v => v.toFixed(0) + "%").join(", ")}</span>`;
        },
      },
      series: [
        {
          type: "bar",
          data: byDay.map(d => ({
            value: d.avg,
            itemStyle: {
              color: d.avg === null ? "#222"
                : d.avg >= 100 ? "#f87171"
                : d.avg >= 70 ? "#f59e0b"
                : "#9CA9FF",
              opacity: 0.8,
            },
          })),
          barMaxWidth: 40,
          label: {
            show: true,
            position: "top",
            formatter: (p: any) => p.value !== null ? `${p.value}%` : "",
            color: "#555",
            fontSize: 10,
          },
          markLine: {
            silent: true,
            symbol: "none",
            animation: false,
            data: [{
              yAxis: parseFloat(overallAvg.toFixed(1)),
              lineStyle: { color: "#333", type: "dashed", width: 1 },
              label: {
                show: true,
                formatter: `avg ${overallAvg.toFixed(1)}%`,
                color: "#555",
                fontSize: 10,
                position: "insideEndTop",
              },
            }],
          },
        },
      ],
    });
  }, [byDay, sessions]);

  return <div ref={containerRef} className="w-full rounded overflow-hidden" />;
}
