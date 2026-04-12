/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useRef } from "react";
import * as echarts from "echarts";
import { SessionData } from "../AnalysisDashboard";

type Props = { sessions: SessionData[] };

export default function RatioHistogram({ sessions }: Props) {
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

    // Build histogram bins: 0-0.25, 0.25-0.5, ..., up to 2.0+
    const binSize = 0.25;
    const bins: Record<string, number> = {};
    const binLabels: string[] = [];

    for (let i = 0; i < 2.0; i += binSize) {
      const label = `${i.toFixed(2)}–${(i + binSize).toFixed(2)}`;
      bins[label] = 0;
      binLabels.push(label);
    }
    bins["2.00+"] = 0;
    binLabels.push("2.00+");

    for (const s of sessions) {
      const ratio = s.realizedMovePct / 100;
      if (ratio >= 2.0) {
        bins["2.00+"]++;
      } else {
        const idx = Math.floor(ratio / binSize);
        const label = binLabels[idx];
        if (label) bins[label]++;
      }
    }

    const counts = binLabels.map((l) => bins[l] ?? 0);
    const avg =
      sessions.reduce((a, s) => a + s.realizedMovePct / 100, 0) /
      sessions.length;

    chartRef.current.setOption({
      backgroundColor: "#111111",
      animation: false,
      grid: { top: 16, bottom: 40, left: 32, right: 16 },
      xAxis: {
        type: "category",
        data: binLabels,
        axisLine: { lineStyle: { color: "#1f1f1f" } },
        axisTick: { show: false },
        axisLabel: {
          color: "#666",
          fontSize: 9,
          rotate: 35,
          interval: 0,
        },
        splitLine: { show: false },
      },
      yAxis: {
        type: "value",
        minInterval: 1,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: "#666", fontSize: 10 },
        splitLine: { lineStyle: { color: "#1a1a1a" } },
      },
      tooltip: {
        trigger: "axis",
        backgroundColor: "#1a1a1a",
        borderColor: "#222",
        padding: [6, 10],
        textStyle: { color: "#9ca3af", fontSize: 11 },
        formatter: (p: any) => {
          const item = Array.isArray(p) ? p[0] : p;
          return `<span style="color:#555;font-size:10px">Ratio ${item.name}</span><br/>
                  <span style="color:#9ca3af">${item.value} session${item.value !== 1 ? "s" : ""}</span>`;
        },
      },
      // Avg ratio vertical line
      markLine: { silent: true },
      series: [
        {
          type: "bar",
          data: counts.map((v, i) => ({
            value: v,
            itemStyle: {
              color: (() => {
                const ratio = i * binSize;
                if (ratio >= 1.0) return "#f87171";
                if (ratio >= 0.75) return "#f59e0b";
                return "#9CA9FF";
              })(),
              opacity: 0.8,
            },
          })),
          barMaxWidth: 32,
          markLine: {
            silent: true,
            symbol: "none",
            animation: false,
            data: [
              {
                xAxis: (avg / binSize - 0.5).toString(),
                lineStyle: { color: "#555", type: "dashed", width: 1 },
                label: {
                  show: true,
                  formatter: `avg ${avg.toFixed(2)}x`,
                  color: "#555",
                  fontSize: 10,
                  position: "insideEndTop",
                },
              },
            ],
          },
        },
      ],
    });
  }, [sessions]);

  return <div ref={containerRef} className="w-full rounded overflow-hidden" />;
}
