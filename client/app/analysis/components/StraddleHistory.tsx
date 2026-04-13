/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useRef, useMemo } from "react";
import * as echarts from "echarts";
import { SessionData } from "../AnalysisDashboard";

type Props = { sessions: SessionData[] };

export default function StraddleHistory({ sessions }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);

  const { straddleValues, avg, todayPctile } = useMemo(() => {
    const values = sessions.map(s => s.openingStraddle);
    const avg = values.length > 0
      ? parseFloat((values.reduce((a, b) => a + b, 0) / values.length).toFixed(2))
      : 0;
    const latest = values[values.length - 1] ?? null;
    const todayPctile = latest !== null && values.length > 1
      ? Math.round((values.filter(v => v <= latest).length / values.length) * 100)
      : null;
    return { straddleValues: values, avg, todayPctile };
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

    const dates = sessions.map(s => s.date.slice(5)); // MM-DD
    const isToday = sessions.map((_, i) => i === sessions.length - 1);

    chartRef.current.setOption({
      backgroundColor: "#111111",
      animation: false,
      grid: { top: 24, bottom: 32, left: 48, right: 16 },
      xAxis: {
        type: "category",
        data: dates,
        axisLine: { lineStyle: { color: "#1f1f1f" } },
        axisTick: { show: false },
        axisLabel: { color: "#666", fontSize: 10, interval: Math.floor(sessions.length / 6) },
        splitLine: { show: false },
      },
      yAxis: {
        type: "value",
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: "#666", fontSize: 10, formatter: (v: number) => `$${v}` },
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
          const idx = p.dataIndex;
          const session = sessions[idx];
          const pctile = Math.round(
            (straddleValues.filter(v => v <= session.openingStraddle).length / straddleValues.length) * 100
          );
          return `<span style="color:#555;font-size:10px">${session.date} ${session.dayOfWeek}</span><br/>
                  Implied <span style="color:#9ca3af">$${session.openingStraddle.toFixed(2)}</span><br/>
                  Percentile <span style="color:#9ca3af">${pctile}th</span>`;
        },
      },
      series: [
        {
          type: "bar",
          data: straddleValues.map((v, i) => ({
            value: v,
            itemStyle: { color: isToday[i] ? "#f59e0b" : "#9CA9FF", opacity: isToday[i] ? 1 : 0.7 },
          })),
          barMaxWidth: 20,
          markLine: {
            silent: true,
            symbol: "none",
            animation: false,
            data: [{
              yAxis: avg,
              lineStyle: { color: "#444", type: "dashed", width: 1 },
              label: { show: true, formatter: `avg $${avg}`, color: "#555", fontSize: 10, position: "insideEndTop" },
            }],
          },
        },
      ],
    });
  }, [sessions, straddleValues, avg]);

  const lastSession = sessions[sessions.length - 1];

  return (
    <div>
      {todayPctile !== null && lastSession && (
        <div className="flex items-center gap-3 mb-2">
          <span className="font-mono text-xs text-[#9ca3af]">
            Hoje ${lastSession.openingStraddle.toFixed(2)}
          </span>
          <span className="font-mono text-xs text-[#f59e0b]">
            {todayPctile}th %ile
          </span>
          <span className="font-sans text-xs text-[#444]">
            {todayPctile > 75 ? "— vol cara" : todayPctile < 25 ? "— vol barata" : "— vol normal"}
          </span>
        </div>
      )}
      <div ref={containerRef} className="w-full rounded overflow-hidden" />
    </div>
  );
}
