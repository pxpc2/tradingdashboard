"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef } from "react";
import * as echarts from "echarts";
import { SkewSnapshot } from "../types";
import { resolveChartPalette } from "../lib/chartPalette";
import { cssVar } from "../lib/theme";

type Props = {
  data: SkewSnapshot[];
  avgSkew: number | null;
};

const SESSION_BREAK_MS = 30 * 60 * 1000;

function formatCTDate(utcMs: number): string {
  return new Date(utcMs).toLocaleDateString("en-US", {
    timeZone: "America/Chicago",
    month: "numeric",
    day: "numeric",
  });
}

function formatCTDateTime(utcMs: number): string {
  const date = new Date(utcMs).toLocaleDateString("en-US", {
    timeZone: "America/Chicago",
    month: "short",
    day: "numeric",
  });
  const time = new Date(utcMs).toLocaleTimeString("en-US", {
    timeZone: "America/Chicago",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return `${date} ${time} CT`;
}

export default function SkewHistoryChart({ data, avgSkew }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any>(null);
  const indexMapRef = useRef<(number | null)[]>([]);

  // ── Init ────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;
    const P = resolveChartPalette();
    const skewMoving = cssVar("--color-skew-moving", "#9B7BB3");
    const panel = cssVar("--color-panel", "#121214");

    const chart = echarts.init(containerRef.current, null, {
      renderer: "canvas",
    });
    chartRef.current = chart;

    chart.setOption({
      backgroundColor: P.bg,
      animation: false,
      grid: { top: 8, right: 56, bottom: 40, left: 8 },
      tooltip: {
        trigger: "axis",
        backgroundColor: P.bg,
        borderColor: P.border2,
        textStyle: { color: P.text2, fontFamily: "monospace", fontSize: 11 },
        axisPointer: {
          type: "cross",
          crossStyle: { color: P.text6, width: 1 },
        },
        formatter: (params: any[]) => {
          if (!params?.length) return "";
          const p = params.find((x: any) => x.value[1] !== null);
          if (!p) return "";
          const idx = p.value[0];
          const utcMs = indexMapRef.current[idx];
          if (utcMs === null || utcMs === undefined) return "";
          return (
            `<span style="color:${skewMoving}">Skew: ${(p.value[1] as number).toFixed(3)}</span><br/>` +
            `<span style="color:${P.text5};font-size:10px">${formatCTDateTime(utcMs)}</span>`
          );
        },
      },
      xAxis: {
        type: "category",
        boundaryGap: false,
        axisLine: { lineStyle: { color: P.border } },
        axisTick: { show: false },
        axisPointer: {
          label: {
            backgroundColor: panel,
            borderColor: P.border2,
            borderWidth: 1,
            color: P.text2,
            fontFamily: "monospace",
            fontSize: 10,
            padding: [3, 6],
            formatter: (params: any) => {
              const idx = parseInt(params.value, 10);
              const utcMs = indexMapRef.current[idx];
              if (!utcMs) return "";
              return formatCTDateTime(utcMs);
            },
          },
        },
        axisLabel: {
          color: P.text5,
          fontSize: 10,
          hideOverlap: true,
          formatter: (value: string) => {
            const idx = parseInt(value, 10);
            const utcMs = indexMapRef.current[idx];
            if (!utcMs) return "";
            return formatCTDate(utcMs);
          },
        },
        splitLine: { lineStyle: { color: P.border, opacity: 0.5 } },
      },
      yAxis: {
        type: "value",
        position: "right",
        axisLine: { lineStyle: { color: P.border } },
        axisLabel: { color: P.text5, fontSize: 10 },
        splitLine: { lineStyle: { color: P.border, opacity: 0.5 } },
        scale: true,
      },
      dataZoom: [
        {
          type: "inside",
          throttle: 40,
          zoomOnMouseWheel: true,
          moveOnMouseMove: true,
          moveOnMouseWheel: false,
          preventDefaultMouseMove: true,
        },
        {
          type: "slider",
          height: 14,
          bottom: 4,
          borderColor: "transparent",
          backgroundColor: panel,
          fillerColor: `${P.text6}88`,
          handleStyle: { color: P.text5, borderColor: P.border2 },
          moveHandleStyle: { color: P.text5 },
          textStyle: { color: P.text5, fontSize: 9 },
          labelFormatter: (value: number) => {
            const utcMs = indexMapRef.current[Math.round(value)];
            return utcMs ? formatCTDate(utcMs) : "";
          },
        },
      ],
      series: [
        {
          name: "Skew",
          type: "line",
          data: [],
          lineStyle: { color: skewMoving, width: 1 },
          itemStyle: { color: skewMoving },
          symbol: "none",
          connectNulls: false,
          endLabel: {
            show: true,
            formatter: (params: any) =>
              typeof params.value[1] === "number"
                ? params.value[1].toFixed(3)
                : "",
            backgroundColor: skewMoving,
            color: P.bg,
            padding: [2, 4],
            borderRadius: 2,
            fontSize: 10,
            fontFamily: "monospace",
            fontWeight: 500,
          },
          markLine: { silent: true, symbol: "none", data: [] },
        },
      ],
    });

    const observer = new ResizeObserver(() => chart.resize());
    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
      chart.dispose();
      chartRef.current = null;
    };
  }, []);

  // ── Data ────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!chartRef.current || !data.length) return;
    const P = resolveChartPalette();

    const seen = new Set<number>();
    const sorted = data
      .filter((s) => {
        const t = new Date(s.created_at).getTime();
        if (seen.has(t)) return false;
        seen.add(t);
        return true;
      })
      .sort(
        (a, b) =>
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      );

    const indexMap: (number | null)[] = [];
    const points: ([number, number] | [number, null])[] = [];
    const sessionStartIndices: number[] = [];
    let prevUtcMs: number | null = null;
    let prevDateCT: string | null = null;
    let idx = 0;

    for (const s of sorted) {
      const utcMs = new Date(s.created_at).getTime();
      const dateCT = new Date(utcMs).toLocaleDateString("en-CA", {
        timeZone: "America/Chicago",
      });

      if (prevUtcMs !== null && utcMs - prevUtcMs > SESSION_BREAK_MS) {
        indexMap.push(null);
        points.push([idx, null]);
        idx++;
      }

      if (prevDateCT !== dateCT) {
        sessionStartIndices.push(idx);
      }

      indexMap.push(utcMs);
      points.push([idx, s.skew]);
      idx++;
      prevUtcMs = utcMs;
      prevDateCT = dateCT;
    }

    indexMapRef.current = indexMap;
    const categories = indexMap.map((_, i) => String(i));

    const markLineData: any[] = [];

    if (avgSkew !== null) {
      markLineData.push({
        yAxis: avgSkew,
        lineStyle: { color: P.text4, type: "dashed", width: 1 },
        label: {
          show: true,
          position: "insideEndTop",
          formatter: `avg ${avgSkew.toFixed(3)}`,
          color: P.text4,
          fontSize: 9,
          fontFamily: "monospace",
        },
      });
    }

    // Day separators — more visible now
    sessionStartIndices.slice(1).forEach((startIdx) => {
      markLineData.push({
        xAxis: startIdx,
        lineStyle: { color: P.text4, type: "dashed", width: 1, opacity: 0.6 },
        label: { show: false },
      });
    });

    chartRef.current.setOption(
      {
        xAxis: { data: categories },
        series: [
          {
            name: "Skew",
            data: points,
            markLine: { silent: true, symbol: "none", data: markLineData },
          },
        ],
      },
      false,
    );
  }, [data, avgSkew]);

  return (
    <div>
      <div className="flex justify-between items-center mb-1.5">
        <span className="font-sans text-xs text-text-4 uppercase tracking-wide">
          25Δ Skew Historical
        </span>
        {avgSkew !== null && (
          <span className="font-mono text-xs text-text-5">
            avg {avgSkew.toFixed(3)}
          </span>
        )}
      </div>
      <div ref={containerRef} className="w-full" style={{ height: 260 }} />
    </div>
  );
}
