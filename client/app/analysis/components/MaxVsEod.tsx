/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useRef } from "react";
import * as echarts from "echarts";
import { SessionData } from "../AnalysisDashboard";
import {
  classifySessionFinal,
  SESSION_TYPE_COLOR,
  SESSION_TYPE_ORDER,
  SessionType,
} from "../../lib/sessionCharacter";

type Props = { sessions: SessionData[] };

export default function MaxVsEod({ sessions }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const chart = echarts.init(containerRef.current, null, {
      renderer: "canvas",
      height: 300,
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

    const maxVal =
      Math.max(
        ...sessions.map((s) => Math.max(s.maxMovePct, s.realizedMovePct)),
      ) * 1.15;

    // Group by session type
    const byType: Record<SessionType, any[]> = {
      "Trend day": [],
      "Trend with partial reversal": [],
      "Reversal day": [],
      "Flat day": [],
    };

    sessions.forEach((s) => {
      const type = classifySessionFinal(s.maxMovePct, s.realizedMovePct);
      byType[type].push([
        parseFloat(s.maxMovePct.toFixed(1)),
        parseFloat(s.realizedMovePct.toFixed(1)),
        s.date,
        s.dayOfWeek,
        type,
      ]);
    });

    const tooltipFmt = (p: any) => {
      if (!Array.isArray(p.data)) return "";
      const [max, eod, date, day, type] = p.data;
      const magnitude = (max / 100).toFixed(2);
      const character = max > 0 ? (eod / max).toFixed(2) : "0.00";
      const color = SESSION_TYPE_COLOR[type as SessionType];
      return `<span style="color:#555;font-size:10px">${date} ${day}</span><br/>
              Max <span style="color:#9ca3af">${max}%</span> → EOD <span style="color:#9ca3af">${eod}%</span><br/>
              Magnitude <span style="color:#9ca3af">${magnitude}x</span> · Character <span style="color:#9ca3af">${character}</span><br/>
              <span style="color:${color}">${type}</span>`;
    };

    chartRef.current.setOption({
      backgroundColor: "#111111",
      animation: false,
      grid: { top: 16, bottom: 64, left: 52, right: 16 },
      legend: {
        data: SESSION_TYPE_ORDER,
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
        axisLabel: {
          color: "#666",
          fontSize: 10,
          formatter: (v: number) => `${v}%`,
        },
        splitLine: { lineStyle: { color: "#1a1a1a" } },
        // Reference line at 100% (= magnitude 1.0, implied threshold)
        markLine: {
          silent: true,
          symbol: "none",
          data: [
            {
              xAxis: 100,
              lineStyle: { color: "#2a2a2a", width: 1, type: "dashed" },
              label: {
                formatter: "implied",
                color: "#444",
                fontSize: 9,
                position: "end",
              },
            },
          ],
        },
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
        formatter: tooltipFmt,
      },
      series: [
        // Diagonal reference (character = 1.0)
        {
          type: "line",
          data: [
            [0, 0],
            [maxVal, maxVal],
          ],
          lineStyle: { color: "#2a2a2a", width: 1, type: "dashed" },
          symbol: "none",
          silent: true,
          z: 1,
          legendHoverLink: false,
          name: "_diagonal",
          tooltip: { show: false },
        },
        ...SESSION_TYPE_ORDER.map((type) => ({
          name: type,
          type: "scatter" as const,
          data: byType[type],
          symbolSize: 8,
          itemStyle: { color: SESSION_TYPE_COLOR[type], opacity: 0.85 },
          z: 3,
        })),
      ],
    });
  }, [sessions]);

  // Summary counts
  const counts = sessions.reduce(
    (acc, s) => {
      const type = classifySessionFinal(s.maxMovePct, s.realizedMovePct);
      acc[type] = (acc[type] ?? 0) + 1;
      return acc;
    },
    {} as Record<SessionType, number>,
  );

  return (
    <div>
      <div className="flex gap-4 mb-2 flex-wrap">
        {SESSION_TYPE_ORDER.map((type) => {
          const color = SESSION_TYPE_COLOR[type];
          return (
            <div key={type} className="flex items-center gap-1.5">
              <div
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: color }}
              />
              <span className="font-mono text-[11px]" style={{ color }}>
                {counts[type] ?? 0}
              </span>
              <span className="font-sans text-[10px] text-[#444]">{type}</span>
            </div>
          );
        })}
      </div>
      <div ref={containerRef} className="w-full rounded overflow-hidden" />
    </div>
  );
}
