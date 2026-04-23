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
type SkewDir = "Rose" | "Flat" | "Fell";

const SKEW_THRESHOLD = 0.005;

function classifySkewChange(change: number): SkewDir {
  if (change > SKEW_THRESHOLD) return "Rose";
  if (change < -SKEW_THRESHOLD) return "Fell";
  return "Flat";
}

const ZONE_X: Record<SkewDir, number> = { Fell: -1, Flat: 0, Rose: 1 };
const ZONE_LABELS: Record<SkewDir, string> = {
  Fell: "skew caiu (< -0.005)",
  Flat: "skew estável (±0.005)",
  Rose: "skew subiu (> +0.005)",
};

export default function SkewVsRealized({ sessions }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);

  const filtered = sessions.filter(
    (s) => s.skewChange !== null && s.maxMovePct > 0,
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
      const skewDir = classifySkewChange(s.skewChange!);
      const retention = parseFloat(
        ((s.realizedMovePct / s.maxMovePct) * 100).toFixed(1),
      );
      const jitter = (Math.random() - 0.5) * 0.3;
      byType[type].push([
        ZONE_X[skewDir] + jitter,
        retention,
        s.date,
        s.dayOfWeek,
        type,
        skewDir,
        parseFloat(s.skewChange!.toFixed(4)),
        parseFloat(s.openingSkew?.toFixed(3) ?? "0"),
        parseFloat(s.closingSkew?.toFixed(3) ?? "0"),
      ]);
    });

    chartRef.current.setOption({
      backgroundColor: P.bg,
      animation: false,
      grid: { top: 16, bottom: 48, left: 52, right: 16 },
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
        min: -1.6,
        max: 1.6,
        axisLine: { lineStyle: { color: P.border } },
        axisTick: { show: false },
        axisLabel: {
          color: P.text3,
          fontSize: 10,
          formatter: (v: number) => {
            if (Math.abs(v - -1) < 0.1) return "↓ caiu";
            if (Math.abs(v) < 0.1) return "→ flat";
            if (Math.abs(v - 1) < 0.1) return "↑ subiu";
            return "";
          },
          interval: 0,
        },
        splitLine: {
          show: true,
          lineStyle: { color: P.border, type: "dashed" },
        },
      },
      yAxis: {
        type: "value",
        name: "EOD / max (%)",
        nameLocation: "middle",
        nameGap: 40,
        nameTextStyle: { color: P.text4, fontSize: 10 },
        min: 0,
        max: 100,
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
          const [
            ,
            retention,
            date,
            day,
            type,
            skewDir,
            change,
            openSkew,
            closeSkew,
          ] = p.data;
          return `<span style="color:${P.text4};font-size:10px">${date} ${day}</span><br/>
                  Skew <span style="color:${P.text2}">${openSkew}</span> → <span style="color:${P.text2}">${closeSkew}</span>
                  <span style="color:${P.text4}"> (${change > 0 ? "+" : ""}${change})</span><br/>
                  <span style="color:${P.text4}">${ZONE_LABELS[skewDir as SkewDir]}</span><br/>
                  EOD/Max <span style="color:${P.text2}">${retention}%</span><br/>
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
        Dados insuficientes
      </div>
    );
  }

  // Per-zone breakdown using new classifier
  const zones: Record<
    SkewDir,
    { trend: number; reverting: number; total: number }
  > = {
    Rose: { trend: 0, reverting: 0, total: 0 },
    Flat: { trend: 0, reverting: 0, total: 0 },
    Fell: { trend: 0, reverting: 0, total: 0 },
  };
  filtered.forEach((s) => {
    const dir = classifySkewChange(s.skewChange!);
    const type = classifySessionFinal(s.maxMovePct, s.realizedMovePct);
    zones[dir].total++;
    if (type === "Trend day") zones[dir].trend++;
    if (type === "Reversal day") zones[dir].reverting++;
  });

  return (
    <div>
      <div className="flex gap-4 mb-2">
        {(["Fell", "Flat", "Rose"] as SkewDir[]).map((dir) => (
          <div key={dir} className="flex items-center gap-1.5 text-[11px]">
            <span className="text-text-5">
              {dir === "Rose" ? "↑" : dir === "Fell" ? "↓" : "→"}
            </span>
            <span className="font-mono text-text-2">{zones[dir].total}</span>
            <span className="text-text-5">dias</span>
            {zones[dir].total > 0 && (
              <span className="text-text-4">
                ({zones[dir].trend} trend / {zones[dir].reverting} rev)
              </span>
            )}
          </div>
        ))}
      </div>
      <div ref={containerRef} className="w-full rounded overflow-hidden" />
    </div>
  );
}
