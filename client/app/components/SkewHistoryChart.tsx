"use client";

import { useEffect, useRef, useMemo, useCallback } from "react";
import {
  createChart,
  LineSeries,
  UTCTimestamp,
  ISeriesApi,
  SeriesType,
  IChartApi,
  createTextWatermark,
} from "lightweight-charts";
import { SkewSnapshot } from "../types";

type Props = {
  data: SkewSnapshot[];
  avgSkew: number | null;
};

function findDayBoundaries(data: SkewSnapshot[]): UTCTimestamp[] {
  const boundaries: UTCTimestamp[] = [];
  let prevDate: string | null = null;
  for (const s of data) {
    const etDate = new Date(s.created_at).toLocaleDateString("en-CA", {
      timeZone: "America/New_York",
    });
    if (prevDate !== null && etDate !== prevDate) {
      boundaries.push(
        Math.floor(new Date(s.created_at).getTime() / 1000) as UTCTimestamp,
      );
    }
    prevDate = etDate;
  }
  return boundaries;
}

export default function SkewHistoryChart({ data, avgSkew }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<SeriesType> | null>(null);
  const boundariesRef = useRef<UTCTimestamp[]>([]);

  const today = useMemo(
    () =>
      new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" }),
    [],
  );

  const drawSeparators = useCallback(() => {
    if (!overlayRef.current || !chartRef.current || !containerRef.current)
      return;
    const canvas = overlayRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = containerRef.current.clientWidth;
    const h = 150;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    for (const ts of boundariesRef.current) {
      const x = chartRef.current.timeScale().timeToCoordinate(ts);
      if (x === null || x < 0 || x > w) continue;
      ctx.save();
      ctx.strokeStyle = "#444";
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
      ctx.restore();
    }
  }, []);

  // Chart creation
  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { color: "#111111" },
        textColor: "#444444",
      },
      grid: {
        vertLines: { color: "#1a1a1a" },
        horzLines: { color: "#1a1a1a" },
      },
      crosshair: {
        vertLine: { color: "#333333" },
        horzLine: { color: "#333333" },
      },
      rightPriceScale: {
        borderColor: "#1f1f1f",
        scaleMargins: { top: 0.1, bottom: 0.1 },
      },
      localization: {
        timeFormatter: (time: number) => {
          const d = new Date(time * 1000);
          return d.toLocaleDateString("en-US", {
            timeZone: "America/Chicago",
            month: "short",
            day: "numeric",
          });
        },
      },
      timeScale: {
        borderColor: "#1f1f1f",
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 80,
        tickMarkFormatter: (time: number) => {
          const d = new Date(time * 1000);
          return d.toLocaleDateString("en-US", {
            timeZone: "America/Chicago",
            month: "numeric",
            day: "numeric",
          });
        },
      },
      width: containerRef.current.clientWidth,
      height: 150,
    });

    const series = chart.addSeries(LineSeries, {
      color: "#60a5fa",
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: true,
      title: "Skew",
    });

    createTextWatermark(chart.panes()[0], {
      horzAlign: "center",
      vertAlign: "center",
      lines: [
        {
          text: "25Δ Skew History",
          color: "rgba(204, 204, 204, 0.15)",
          fontSize: 18,
        },
      ],
    });

    chartRef.current = chart;
    seriesRef.current = series;

    chart.timeScale().subscribeVisibleTimeRangeChange(drawSeparators);

    const handleResize = () => {
      if (containerRef.current) {
        chart.applyOptions({ width: containerRef.current.clientWidth });
        drawSeparators();
      }
    };
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      chart.timeScale().unsubscribeVisibleTimeRangeChange(drawSeparators);
      chart.remove();
    };
  }, [drawSeparators]);

  // Data updates
  useEffect(() => {
    if (!seriesRef.current || !chartRef.current) return;

    boundariesRef.current = findDayBoundaries(data);

    const points = data
      .map((s) => ({
        time: Math.floor(
          new Date(s.created_at).getTime() / 1000,
        ) as UTCTimestamp,
        value: s.skew,
      }))
      .filter((p, i, arr) => i === 0 || p.time > arr[i - 1].time);

    seriesRef.current.setData(points);

    if (avgSkew !== null) {
      try {
        seriesRef.current.createPriceLine({
          price: avgSkew,
          color: "#333",
          lineWidth: 1,
          lineStyle: 2,
          axisLabelVisible: false,
          title: "",
        });
      } catch {}
    }

    try {
      chartRef.current.timeScale().fitContent();
    } catch {}

    drawSeparators();
  }, [data, avgSkew, today, drawSeparators]);

  return (
    <div>
      <div className="flex justify-between items-center mb-1.5">
        <span className="font-sans text-xs text-[#555] uppercase tracking-wide">
          25Δ Skew
        </span>
        {avgSkew !== null && (
          <span className="font-mono text-xs text-[#444]">
            avg {avgSkew.toFixed(3)}
          </span>
        )}
      </div>
      <div style={{ position: "relative" }}>
        <div ref={containerRef} className="w-full rounded overflow-hidden" />
        <canvas
          ref={overlayRef}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            pointerEvents: "none",
            zIndex: 10,
          }}
        />
      </div>
    </div>
  );
}
