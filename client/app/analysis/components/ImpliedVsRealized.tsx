/* eslint-disable @typescript-eslint/no-explicit-any */

"use client";

import { useEffect, useRef } from "react";
import * as echarts from "echarts";
import { SessionData } from "../AnalysisDashboard";

type Props = { sessions: SessionData[] };

export default function ImpliedVsRealized({ sessions }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);

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
    if (!chartRef.current) return;

    const scatterData = sessions.map((s) => [
      parseFloat(s.openingStraddle.toFixed(2)),
      parseFloat(s.realizedMovePts.toFixed(2)),
      s.date,
      s.dayOfWeek,
    ]);

    const maxVal =
      Math.max(
        ...sessions.map((s) => Math.max(s.openingStraddle, s.realizedMovePts)),
      ) * 1.2;

    chartRef.current.setOption({
      backgroundColor: "#111111",
      animation: false,
      grid: { top: 16, bottom: 40, left: 48, right: 16 },
      xAxis: {
        type: "value",
        name: "Implied (straddle)",
        nameLocation: "middle",
        nameGap: 28,
        nameTextStyle: { color: "#666", fontSize: 10 },
        min: 0,
        max: parseFloat(maxVal.toFixed(0)),
        axisLine: { lineStyle: { color: "#1f1f1f" } },
        axisTick: { show: false },
        axisLabel: {
          color: "#666",
          fontSize: 10,
          formatter: (v: number) => `$${v}`,
        },
        splitLine: { lineStyle: { color: "#1a1a1a" } },
      },
      yAxis: {
        type: "value",
        name: "Realized (pts)",
        nameLocation: "middle",
        nameGap: 36,
        nameTextStyle: { color: "#666", fontSize: 10 },
        min: 0,
        max: parseFloat(maxVal.toFixed(0)),
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: "#666", fontSize: 10 },
        splitLine: { lineStyle: { color: "#1a1a1a" } },
      },
      tooltip: {
        trigger: "item",
        backgroundColor: "#1a1a1a",
        borderColor: "#222",
        padding: [6, 10],
        textStyle: { color: "#9ca3af", fontSize: 11 },
        formatter: (p: any) => {
          const [implied, realized, date, day] = p.data;
          const ratio = (realized / implied).toFixed(2);
          return `<span style="color:#555;font-size:10px">${date} ${day}</span><br/>
                  Implied <span style="color:#9ca3af">$${implied}</span><br/>
                  Realized <span style="color:#9ca3af">${realized}pts</span><br/>
                  Ratio <span style="color:${parseFloat(ratio) >= 1 ? "#f87171" : "#9ca3af"}">${ratio}x</span>`;
        },
      },
      series: [
        {
          // Breakeven line (y = x)
          type: "line",
          data: [
            [0, 0],
            [maxVal, maxVal],
          ],
          lineStyle: { color: "#2a2a2a", width: 1, type: "dashed" },
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
              const ratio = p.data[1] / p.data[0];
              return ratio >= 1
                ? "#f87171"
                : ratio >= 0.7
                  ? "#f59e0b"
                  : "#9CA9FF";
            },
            opacity: 0.85,
          },
          z: 2,
        },
      ],
    });
  }, [sessions]);

  return <div ref={containerRef} className="w-full rounded overflow-hidden" />;
}
