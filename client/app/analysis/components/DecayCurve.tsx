/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useRef, useMemo } from "react";
import * as echarts from "echarts";
import { SessionData } from "../AnalysisDashboard";
import { resolveChartPalette } from "../../lib/chartPalette";

type StraddleSnapshot = {
  created_at: string;
  spx_ref: number;
  atm_strike: number;
  straddle_mid: number;
  es_basis: number | null;
};

type Props = {
  sessions: SessionData[];
  straddleSnapshots: StraddleSnapshot[];
};

function getETDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-CA", {
    timeZone: "America/New_York",
  });
}

function getMinutesSinceOpen(iso: string): number {
  const d = new Date(iso);
  const etStr = d.toLocaleString("en-US", {
    timeZone: "America/New_York",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const [h, m] = etStr.split(":").map(Number);
  return (h - 9) * 60 + (m - 30);
}

export default function DecayCurve({ sessions, straddleSnapshots }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);

  const today = new Date().toLocaleDateString("en-CA", {
    timeZone: "America/New_York",
  });

  const { avgCurve, todayCurve } = useMemo(() => {
    const byDate = new Map<string, StraddleSnapshot[]>();
    for (const s of straddleSnapshots) {
      const date = getETDate(s.created_at);
      if (!byDate.has(date)) byDate.set(date, []);
      byDate.get(date)!.push(s);
    }

    const buckets: Record<number, number[]> = {};

    for (const [date, snaps] of byDate) {
      if (date === today) continue;
      const sorted = [...snaps].sort(
        (a, b) =>
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      );
      const opening = sorted[0];
      if (!opening?.straddle_mid || opening.straddle_mid <= 0) continue;

      for (const s of sorted) {
        const min = getMinutesSinceOpen(s.created_at);
        if (min < 0 || min > 390) continue;
        const normalized = (s.straddle_mid / opening.straddle_mid) * 100;
        if (!buckets[min]) buckets[min] = [];
        buckets[min].push(normalized);
      }
    }

    const avgCurve: [number, number][] = Object.entries(buckets)
      .map(
        ([min, vals]) =>
          [
            parseInt(min),
            parseFloat(
              (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2),
            ),
          ] as [number, number],
      )
      .sort((a, b) => a[0] - b[0]);

    const todaySnaps = byDate.get(today) ?? [];
    const todaySorted = [...todaySnaps].sort(
      (a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    );
    const todayOpening = todaySorted[0];
    const todayCurve: [number, number][] = todayOpening?.straddle_mid
      ? todaySorted
          .map((s) => {
            const min = getMinutesSinceOpen(s.created_at);
            const normalized =
              (s.straddle_mid / todayOpening.straddle_mid) * 100;
            return [min, parseFloat(normalized.toFixed(2))] as [number, number];
          })
          .filter(([min]) => min >= 0 && min <= 390)
      : [];

    return { avgCurve, todayCurve };
  }, [sessions, straddleSnapshots, today]);

  useEffect(() => {
    if (!containerRef.current) return;
    const chart = echarts.init(containerRef.current, null, {
      renderer: "canvas",
      height: 420,
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

    const formatMin = (min: number) => {
      const totalMins = 9 * 60 + 30 + min;
      const h = Math.floor(totalMins / 60) - 1;
      const m = totalMins % 60;
      return `${h}:${m.toString().padStart(2, "0")}`;
    };

    chartRef.current.setOption({
      backgroundColor: P.bg,
      animation: false,
      grid: { top: 16, bottom: 32, left: 40, right: 16 },
      xAxis: {
        type: "value",
        min: 0,
        max: 390,
        axisLine: { lineStyle: { color: P.border } },
        axisTick: { show: false },
        axisLabel: {
          color: P.text3,
          fontSize: 10,
          formatter: (v: number) => formatMin(v),
          interval: 59,
        },
        splitLine: { lineStyle: { color: P.border } },
      },
      yAxis: {
        type: "value",
        min: 0,
        max: 110,
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
        trigger: "axis",
        backgroundColor: P.bg,
        borderColor: P.border2,
        padding: [6, 10],
        textStyle: { color: P.text2, fontSize: 11 },
        formatter: (params: any) => {
          const min = params[0]?.axisValue;
          let out = `<span style="color:${P.text4};font-size:10px">${formatMin(min)} CT</span><br/>`;
          for (const p of params) {
            if (p.value !== undefined) {
              out += `<span style="color:${p.color}">${p.seriesName}</span> <span style="color:${P.text2}">${p.value[1]}%</span><br/>`;
            }
          }
          return out;
        },
      },
      legend: {
        data: ["Média", "Hoje"],
        right: 16,
        top: 4,
        textStyle: { color: P.text3, fontSize: 10 },
        inactiveColor: P.text6,
        itemWidth: 16,
        itemHeight: 2,
      },
      series: [
        {
          name: "Média",
          type: "line",
          data: avgCurve,
          lineStyle: { color: P.text5, width: 1.5, type: "dashed" },
          itemStyle: { color: P.text5 },
          symbol: "none",
          emphasis: { focus: "series", lineStyle: { width: 2 } },
          z: 1,
        },
        ...(todayCurve.length > 0
          ? [
              {
                name: "Hoje",
                type: "line",
                data: todayCurve,
                lineStyle: { color: P.skewMoving, width: 1.5 },
                itemStyle: { color: P.skewMoving },
                symbol: "none",
                emphasis: { focus: "series", lineStyle: { width: 2.5 } },
                z: 2,
              },
            ]
          : []),
      ],
    });
  }, [avgCurve, todayCurve]);

  return <div ref={containerRef} className="w-full rounded overflow-hidden" />;
}
