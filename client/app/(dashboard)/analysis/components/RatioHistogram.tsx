/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useRef } from "react";
import * as echarts from "echarts";
import { SessionData } from "../AnalysisDashboard";
import { resolveChartPalette } from "../../../lib/chartPalette";

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
    const P = resolveChartPalette();

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
      backgroundColor: P.bg,
      animation: false,
      grid: { top: 16, bottom: 40, left: 32, right: 16 },
      xAxis: {
        type: "category",
        data: binLabels,
        axisLine: { lineStyle: { color: P.border } },
        axisTick: { show: false },
        axisLabel: {
          color: P.text3,
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
        axisLabel: { color: P.text3, fontSize: 10 },
        splitLine: { lineStyle: { color: P.border } },
      },
      tooltip: {
        trigger: "axis",
        backgroundColor: P.bg,
        borderColor: P.border2,
        padding: [6, 10],
        textStyle: { color: P.text2, fontSize: 11 },
        formatter: (p: any) => {
          const item = Array.isArray(p) ? p[0] : p;
          return `<span style="color:${P.text4};font-size:10px">Ratio ${item.name}</span><br/>
                  <span style="color:${P.text2}">${item.value} session${item.value !== 1 ? "s" : ""}</span>`;
        },
      },
      series: [
        {
          type: "bar",
          data: counts.map((v, i) => ({
            value: v,
            itemStyle: {
              color: (() => {
                const ratio = i * binSize;
                if (ratio >= 1.0) return P.regime.trend;
                if (ratio >= 0.75) return P.regime.partial;
                return P.text2;
              })(),
              opacity: 0.85,
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
                lineStyle: { color: P.text4, type: "dashed", width: 1 },
                label: {
                  show: true,
                  formatter: `avg ${avg.toFixed(2)}x`,
                  color: P.text3,
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
