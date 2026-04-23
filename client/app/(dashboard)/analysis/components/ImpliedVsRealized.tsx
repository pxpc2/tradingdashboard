/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useRef } from "react";
import * as echarts from "echarts";
import { SessionData } from "../AnalysisDashboard";
import { resolveChartPalette } from "../../../lib/chartPalette";

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
    const P = resolveChartPalette();

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
      backgroundColor: P.bg,
      animation: false,
      grid: { top: 16, bottom: 40, left: 48, right: 16 },
      xAxis: {
        type: "value",
        name: "Implied (straddle)",
        nameLocation: "middle",
        nameGap: 28,
        nameTextStyle: { color: P.text3, fontSize: 10 },
        min: 0,
        max: parseFloat(maxVal.toFixed(0)),
        axisLine: { lineStyle: { color: P.border } },
        axisTick: { show: false },
        axisLabel: {
          color: P.text3,
          fontSize: 10,
          formatter: (v: number) => `$${v}`,
        },
        splitLine: { lineStyle: { color: P.border } },
      },
      yAxis: {
        type: "value",
        name: "Realized (pts)",
        nameLocation: "middle",
        nameGap: 36,
        nameTextStyle: { color: P.text3, fontSize: 10 },
        min: 0,
        max: parseFloat(maxVal.toFixed(0)),
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: P.text3, fontSize: 10 },
        splitLine: { lineStyle: { color: P.border } },
      },
      tooltip: {
        trigger: "item",
        backgroundColor: P.bg,
        borderColor: P.border2,
        padding: [6, 10],
        textStyle: { color: P.text2, fontSize: 11 },
        formatter: (p: any) => {
          const [implied, realized, date, day] = p.data;
          const ratio = (realized / implied).toFixed(2);
          const color = parseFloat(ratio) >= 1 ? P.regime.trend : P.text2;
          return `<span style="color:${P.text4};font-size:10px">${date} ${day}</span><br/>
                  Implied <span style="color:${P.text2}">$${implied}</span><br/>
                  Realized <span style="color:${P.text2}">${realized}pts</span><br/>
                  Ratio <span style="color:${color}">${ratio}x</span>`;
        },
      },
      series: [
        {
          type: "line",
          data: [
            [0, 0],
            [maxVal, maxVal],
          ],
          lineStyle: { color: P.border2, width: 1, type: "dashed" },
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
                ? P.regime.trend
                : ratio >= 0.7
                  ? P.regime.partial
                  : P.text2;
            },
            opacity: 0.85,
          },
          emphasis: {
            focus: "series",
            itemStyle: { opacity: 1, borderWidth: 1, borderColor: P.text2 },
          },
          z: 2,
        },
      ],
    });
  }, [sessions]);

  return <div ref={containerRef} className="w-full rounded overflow-hidden" />;
}
