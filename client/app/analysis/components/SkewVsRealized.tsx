/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useRef, useMemo } from "react";
import * as echarts from "echarts";
import { SessionData } from "../AnalysisDashboard";

type Props = { sessions: SessionData[] };

export default function SkewVsRealized({ sessions }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);

  const filtered = useMemo(
    () => sessions.filter(s => s.openingSkew !== null),
    [sessions],
  );

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

    const skewValues = filtered.map(s => s.openingSkew!);
    const minSkew = Math.min(...skewValues) * 0.97;
    const maxSkew = Math.max(...skewValues) * 1.03;

    const scatterData = filtered.map(s => [
      parseFloat(s.openingSkew!.toFixed(3)),
      parseFloat(s.realizedMovePct.toFixed(1)),
      s.date,
      s.dayOfWeek,
    ]);

    // Simple linear regression for trend line
    const n = filtered.length;
    const sumX = skewValues.reduce((a, b) => a + b, 0);
    const sumY = filtered.reduce((a, s) => a + s.realizedMovePct, 0);
    const sumXY = filtered.reduce((a, s) => a + s.openingSkew! * s.realizedMovePct, 0);
    const sumX2 = skewValues.reduce((a, x) => a + x * x, 0);
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;
    const trendLine = [
      [parseFloat(minSkew.toFixed(3)), parseFloat((slope * minSkew + intercept).toFixed(1))],
      [parseFloat(maxSkew.toFixed(3)), parseFloat((slope * maxSkew + intercept).toFixed(1))],
    ];
    const trendDirection = slope > 0.5 ? "↑ skew alto → mais movimento" : slope < -0.5 ? "↓ skew alto → menos movimento" : "→ sem relação clara";

    chartRef.current.setOption({
      backgroundColor: "#111111",
      animation: false,
      grid: { top: 16, bottom: 40, left: 52, right: 16 },
      xAxis: {
        type: "value",
        name: "Opening skew",
        nameLocation: "middle",
        nameGap: 28,
        nameTextStyle: { color: "#444", fontSize: 10 },
        min: parseFloat(minSkew.toFixed(3)),
        max: parseFloat(maxSkew.toFixed(3)),
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
          if (!Array.isArray(p.data) || p.data.length < 4) return "";
          const [skew, rv, date, day] = p.data;
          return `<span style="color:#555;font-size:10px">${date} ${day}</span><br/>
                  Skew <span style="color:#9ca3af">${skew}</span><br/>
                  RV/IV <span style="color:${rv >= 100 ? "#f87171" : rv >= 70 ? "#f59e0b" : "#9CA9FF"}">${rv}%</span>`;
        },
      },
      series: [
        {
          type: "line",
          data: trendLine,
          lineStyle: { color: "#333", width: 1, type: "dashed" },
          symbol: "none",
          silent: true,
          z: 1,
        },
        {
          type: "scatter",
          data: scatterData,
          symbolSize: 7,
          itemStyle: {
            color: (p: any) => {
              const rv = p.data[1];
              return rv >= 100 ? "#f87171" : rv >= 70 ? "#f59e0b" : "#9CA9FF";
            },
            opacity: 0.85,
          },
          z: 2,
        },
      ],
    });

    // Update trend label
    const label = containerRef.current?.previousElementSibling as HTMLElement;
    if (label) label.textContent = trendDirection;
  }, [filtered]);

  if (filtered.length < 3) {
    return (
      <div className="flex items-center justify-center h-40 text-xs text-[#333]">
        Dados insuficientes — precisa de skew em mais sessões
      </div>
    );
  }

  return (
    <div>
      <div className="font-sans text-[11px] text-[#555] mb-2" />
      <div ref={containerRef} className="w-full rounded overflow-hidden" />
    </div>
  );
}
