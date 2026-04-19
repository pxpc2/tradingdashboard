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
} from "../../lib/sessionCharacter";
import { resolveChartPalette } from "../../lib/chartPalette";

type Props = { sessions: SessionData[] };

export default function VixVsRealized({ sessions }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);

  const filtered = sessions.filter(
    (s) => s.vix1dVixRatio !== null && s.maxMovePct > 0,
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

    const ratios = filtered.map((s) => s.vix1dVixRatio!);
    const minR = Math.min(...ratios);
    const maxR = Math.max(...ratios);
    const pad = (maxR - minR) * 0.1 || 0.05;

    const byType: Record<SessionType, any[]> = {
      "Trend day": [],
      "Trend with partial reversal": [],
      "Reversal day": [],
      "Flat day": [],
    };

    filtered.forEach((s) => {
      const type = classifySessionFinal(s.maxMovePct, s.realizedMovePct);
      byType[type].push([
        parseFloat(s.vix1dVixRatio!.toFixed(3)),
        parseFloat(s.realizedMovePct.toFixed(1)),
        s.date,
        s.dayOfWeek,
        type,
        s.openingVix?.toFixed(2) ?? "—",
        s.hasMacro ? "Macro" : "",
      ]);
    });

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
        name: "VIX1D / VIX ratio",
        nameLocation: "middle",
        nameGap: 28,
        nameTextStyle: { color: P.text4, fontSize: 10 },
        min: parseFloat((minR - pad).toFixed(2)),
        max: parseFloat((maxR + pad).toFixed(2)),
        axisLine: { lineStyle: { color: P.border } },
        axisTick: { show: false },
        axisLabel: { color: P.text3, fontSize: 10 },
        splitLine: { lineStyle: { color: P.border } },
        markLine: {
          silent: true,
          symbol: "none",
          data: [
            {
              xAxis: 1.0,
              lineStyle: { color: P.border2, width: 1, type: "dashed" },
            },
          ],
        },
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
          const [ratio, rv, date, day, type, vix, macro] = p.data;
          return `<span style="color:${P.text4};font-size:10px">${date} ${day}${macro ? " 📅" : ""}</span><br/>
                  VIX1D/VIX <span style="color:${P.text2}">${ratio}</span>
                  ${vix !== "—" ? `<span style="color:${P.text4}"> (VIX ${vix})</span>` : ""}<br/>
                  RV/IV <span style="color:${P.text2}">${rv}%</span><br/>
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
      })),
    });
  }, [filtered]);

  if (filtered.length < 2) {
    return (
      <div className="flex items-center justify-center h-40 text-xs text-text-6">
        Dados insuficientes — VIX disponível após 2026-04-17
      </div>
    );
  }

  const highRatio = filtered.filter((s) => (s.vix1dVixRatio ?? 0) > 1.0);
  const lowRatio = filtered.filter((s) => (s.vix1dVixRatio ?? 1) <= 1.0);
  const avgRvHigh =
    highRatio.length > 0
      ? (
          highRatio.reduce((a, s) => a + s.realizedMovePct, 0) /
          highRatio.length
        ).toFixed(1)
      : null;
  const avgRvLow =
    lowRatio.length > 0
      ? (
          lowRatio.reduce((a, s) => a + s.realizedMovePct, 0) / lowRatio.length
        ).toFixed(1)
      : null;

  return (
    <div>
      <div className="flex gap-4 mb-2 text-[11px]">
        <span className="text-text-4">
          ratio &gt;1.0 ({highRatio.length} dias)
          {avgRvHigh && (
            <span className="font-mono text-amber ml-1">
              avg {avgRvHigh}% RV/IV
            </span>
          )}
        </span>
        <span className="text-text-5">·</span>
        <span className="text-text-4">
          ratio ≤1.0 ({lowRatio.length} dias)
          {avgRvLow && (
            <span className="font-mono text-indigo ml-1">
              avg {avgRvLow}% RV/IV
            </span>
          )}
        </span>
      </div>
      <div ref={containerRef} className="w-full rounded overflow-hidden" />
    </div>
  );
}
