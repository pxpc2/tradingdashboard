/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useRef, useMemo } from "react";
import * as echarts from "echarts";
import { SessionData } from "../AnalysisDashboard";
import { resolveChartPalette } from "../../../lib/chartPalette";

type Props = { sessions: SessionData[] };

export default function StraddleHistory({ sessions }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);

  const { straddleValues, avg, todayPctile } = useMemo(() => {
    const values = sessions.map((s) => s.openingStraddle);
    const avg =
      values.length > 0
        ? parseFloat(
            (values.reduce((a, b) => a + b, 0) / values.length).toFixed(2),
          )
        : 0;
    const latest = values[values.length - 1] ?? null;
    const todayPctile =
      latest !== null && values.length > 1
        ? Math.round(
            (values.filter((v) => v <= latest).length / values.length) * 100,
          )
        : null;
    return { straddleValues: values, avg, todayPctile };
  }, [sessions]);

  useEffect(() => {
    if (!containerRef.current) return;
    const chart = echarts.init(containerRef.current, null, {
      renderer: "canvas",
      height: 220,
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

    const dates = sessions.map((s) => s.date.slice(5));
    const isToday = sessions.map((_, i) => i === sessions.length - 1);

    chartRef.current.setOption({
      backgroundColor: P.bg,
      animation: false,
      grid: { top: 24, bottom: 32, left: 48, right: 16 },
      xAxis: {
        type: "category",
        data: dates,
        axisLine: { lineStyle: { color: P.border } },
        axisTick: { show: false },
        axisLabel: {
          color: P.text3,
          fontSize: 10,
          interval: Math.floor(sessions.length / 6),
        },
        splitLine: { show: false },
      },
      yAxis: {
        type: "value",
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: {
          color: P.text3,
          fontSize: 10,
          formatter: (v: number) => `$${v}`,
        },
        splitLine: { lineStyle: { color: P.border } },
      },
      tooltip: {
        trigger: "axis",
        backgroundColor: P.bg,
        borderColor: P.border2,
        padding: [6, 10],
        textStyle: { color: P.text2, fontSize: 11 },
        formatter: (params: any) => {
          const p = Array.isArray(params) ? params[0] : params;
          const idx = p.dataIndex;
          const session = sessions[idx];
          const pctile = Math.round(
            (straddleValues.filter((v) => v <= session.openingStraddle).length /
              straddleValues.length) *
              100,
          );
          return `<span style="color:${P.text4};font-size:10px">${session.date} ${session.dayOfWeek}</span><br/>
                  Implied <span style="color:${P.text2}">$${session.openingStraddle.toFixed(2)}</span><br/>
                  Percentile <span style="color:${P.text2}">${pctile}th</span>`;
        },
      },
      series: [
        {
          type: "bar",
          data: straddleValues.map((v, i) => ({
            value: v,
            itemStyle: {
              color: isToday[i] ? P.amber : P.skewMoving,
              opacity: isToday[i] ? 1 : 0.7,
            },
          })),
          barMaxWidth: 20,
          markLine: {
            silent: true,
            symbol: "none",
            animation: false,
            data: [
              {
                yAxis: avg,
                lineStyle: { color: P.text5, type: "dashed", width: 1 },
                label: {
                  show: true,
                  formatter: `avg $${avg}`,
                  color: P.text4,
                  fontSize: 10,
                  position: "insideEndTop",
                },
              },
            ],
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
          <span className="font-mono text-xs text-text-2">
            Hoje ${lastSession.openingStraddle.toFixed(2)}
          </span>
          <span className="font-mono text-xs text-amber">
            {todayPctile}th %ile
          </span>
          <span className="font-sans text-xs text-text-5">
            {todayPctile > 75
              ? "— vol cara"
              : todayPctile < 25
                ? "— vol barata"
                : "— vol normal"}
          </span>
        </div>
      )}
      <div ref={containerRef} className="w-full rounded overflow-hidden" />
    </div>
  );
}
