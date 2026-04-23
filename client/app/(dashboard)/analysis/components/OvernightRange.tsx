/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useRef } from "react";
import * as echarts from "echarts";
import { SessionData } from "../AnalysisDashboard";
import {
  classifySessionFinal,
  SESSION_TYPE_ORDER,
  SessionType,
  resolveSessionTypeColors,
} from "../../../lib/sessionCharacter";
import { resolveChartPalette } from "../../../lib/chartPalette";

type Props = { sessions: SessionData[] };

export default function OvernightRange({ sessions }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);

  const filtered = sessions.filter(
    (s) => s.overnightRange !== null && s.overnightRange > 0,
  );

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
    if (!chartRef.current || filtered.length === 0) return;
    const P = resolveChartPalette();
    const C = resolveSessionTypeColors();

    const byType: Record<SessionType, any[]> = {
      "Trend day": [],
      "Trend with partial reversal": [],
      "Reversal day": [],
      "Flat day": [],
    };

    filtered.forEach((s) => {
      const type = classifySessionFinal(s.maxMovePct, s.realizedMovePct);
      byType[type].push([
        parseFloat(s.overnightRange!.toFixed(2)),
        parseFloat(s.realizedMovePct.toFixed(1)),
        s.date,
        s.dayOfWeek,
        type,
        parseFloat(s.maxMovePct.toFixed(1)),
      ]);
    });

    const ranges = filtered.map((s) => s.overnightRange!);
    const maxRange = Math.max(...ranges) * 1.15;

    chartRef.current.setOption({
      backgroundColor: P.bg,
      animation: false,
      grid: { top: 16, bottom: 64, left: 52, right: 16 },
      legend: {
        data: SESSION_TYPE_ORDER,
        bottom: 4,
        textStyle: { color: P.text3, fontSize: 10 },
        inactiveColor: P.text6,
        itemWidth: 10,
        itemHeight: 10,
      },
      xAxis: {
        type: "value",
        name: "Overnight ES range (pts)",
        nameLocation: "middle",
        nameGap: 28,
        nameTextStyle: { color: P.text4, fontSize: 10 },
        min: 0,
        max: parseFloat(maxRange.toFixed(0)),
        axisLine: { lineStyle: { color: P.border } },
        axisTick: { show: false },
        axisLabel: { color: P.text3, fontSize: 10 },
        splitLine: { lineStyle: { color: P.border } },
      },
      yAxis: {
        type: "value",
        name: "RV/IV (%)",
        nameLocation: "middle",
        nameGap: 40,
        nameTextStyle: { color: P.text4, fontSize: 10 },
        min: 0,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: {
          color: P.text3,
          fontSize: 10,
          formatter: (v: number) => `${v}%`,
        },
        splitLine: { lineStyle: { color: P.border } },
      },
      tooltip: {
        trigger: "item",
        backgroundColor: P.bg,
        borderColor: P.border2,
        padding: [6, 10],
        textStyle: { color: P.text2, fontSize: 11 },
        formatter: (p: any) => {
          if (!Array.isArray(p.data)) return "";
          const [range, rv, date, day, type, maxPct] = p.data;
          return `<span style="color:${P.text4};font-size:10px">${date} ${day}</span><br/>
                  Overnight range <span style="color:${P.text2}">${range}pts</span><br/>
                  RV/IV <span style="color:${P.text2}">${rv}%</span><br/>
                  Max intraday <span style="color:${P.text2}">${maxPct}%</span><br/>
                  <span style="color:${C[type as SessionType]}">${type}</span>`;
        },
      },
      series: SESSION_TYPE_ORDER.map((type) => ({
        name: type,
        type: "scatter" as const,
        data: byType[type],
        symbolSize: 7,
        itemStyle: { color: C[type], opacity: 0.85 },
        emphasis: {
          focus: "series",
          itemStyle: { opacity: 1, borderWidth: 1, borderColor: P.text2 },
        },
        blur: { itemStyle: { opacity: 0.12 } },
        z: 2,
      })),
    });
  }, [filtered]);

  if (filtered.length < 2) {
    return (
      <div className="flex items-center justify-center h-40 text-xs text-text-6">
        Dados insuficientes — aguardando mais sessões com overnight range
      </div>
    );
  }

  const avgRange =
    filtered.reduce((a, s) => a + s.overnightRange!, 0) / filtered.length;
  const today = filtered[filtered.length - 1];

  return (
    <div>
      <div className="flex gap-4 mb-2">
        <span className="font-sans text-[11px] text-text-4">
          avg range{" "}
          <span className="font-mono text-text-2">
            {avgRange.toFixed(1)}pts
          </span>
        </span>
        {today && (
          <span className="font-sans text-[11px] text-text-4">
            hoje{" "}
            <span className="font-mono text-amber">
              {today.overnightRange!.toFixed(1)}pts
            </span>
          </span>
        )}
      </div>
      <div ref={containerRef} className="w-full rounded overflow-hidden" />
    </div>
  );
}
