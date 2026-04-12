/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useRef, useMemo } from "react";
import * as echarts from "echarts";
import { SessionData } from "../AnalysisDashboard";

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
  return (h - 9) * 60 + (m - 30); // minutes since 09:30 ET
}

export default function DecayCurve({ sessions, straddleSnapshots }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);

  // Today's ET date
  const today = new Date().toLocaleDateString("en-CA", {
    timeZone: "America/New_York",
  });

  // Build normalized decay data
  const { avgCurve, todayCurve } = useMemo(() => {
    const byDate = new Map<string, StraddleSnapshot[]>();
    for (const s of straddleSnapshots) {
      const date = getETDate(s.created_at);
      if (!byDate.has(date)) byDate.set(date, []);
      byDate.get(date)!.push(s);
    }

    // For each past session (not today), normalize to opening = 100
    // then bucket by minute-since-open (0–390 = 6.5 hours RTH)
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

    // Average per minute bucket
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

    // Today's curve
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

    // Format minute offset as CT time label
    const formatMin = (min: number) => {
      const totalMins = 9 * 60 + 30 + min; // minutes since midnight ET
      const h = Math.floor(totalMins / 60) - 1; // ET→CT offset -1
      const m = totalMins % 60;
      return `${h}:${m.toString().padStart(2, "0")}`;
    };

    chartRef.current.setOption({
      backgroundColor: "#111111",
      animation: false,
      grid: { top: 16, bottom: 32, left: 40, right: 16 },
      xAxis: {
        type: "value",
        min: 0,
        max: 390,
        axisLine: { lineStyle: { color: "#1f1f1f" } },
        axisTick: { show: false },
        axisLabel: {
          color: "#666",
          fontSize: 10,
          formatter: (v: number) => formatMin(v),
          interval: 59,
        },
        splitLine: { lineStyle: { color: "#1a1a1a" } },
      },
      yAxis: {
        type: "value",
        min: 0,
        max: 110,
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
        trigger: "axis",
        backgroundColor: "#1a1a1a",
        borderColor: "#222",
        padding: [6, 10],
        textStyle: { color: "#9ca3af", fontSize: 11 },
        formatter: (params: any) => {
          const min = params[0]?.axisValue;
          let out = `<span style="color:#555;font-size:10px">${formatMin(min)} CT</span><br/>`;
          for (const p of params) {
            if (p.value !== undefined) {
              out += `<span style="color:${p.color}">${p.seriesName}</span> <span style="color:#9ca3af">${p.value[1]}%</span><br/>`;
            }
          }
          return out;
        },
      },
      legend: {
        data: ["Avg", "Today"],
        right: 16,
        top: 4,
        textStyle: { color: "#555", fontSize: 10 },
        itemWidth: 16,
        itemHeight: 2,
      },
      series: [
        {
          name: "Avg",
          type: "line",
          data: avgCurve,
          lineStyle: { color: "#333", width: 1.5, type: "dashed" },
          itemStyle: { color: "#333" },
          symbol: "none",
          z: 1,
        },
        ...(todayCurve.length > 0
          ? [
              {
                name: "Today",
                type: "line",
                data: todayCurve,
                lineStyle: { color: "#9CA9FF", width: 1.5 },
                itemStyle: { color: "#9CA9FF" },
                symbol: "none",
                z: 2,
              },
            ]
          : []),
      ],
    });
  }, [avgCurve, todayCurve]);

  return <div ref={containerRef} className="w-full rounded overflow-hidden" />;
}
