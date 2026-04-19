"use client";

import { useEffect, useRef, useMemo, useCallback } from "react";
import {
  createChart,
  LineSeries,
  UTCTimestamp,
  ISeriesApi,
  SeriesType,
  IChartApi,
  IPriceLine,
  createTextWatermark,
} from "lightweight-charts";
import { SkewSnapshot } from "../types";
import { cssVar } from "../lib/theme";

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
  const avgLineRef = useRef<IPriceLine | null>(null);
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

    const strokeColor = cssVar("--color-text-5", "#44433F");

    for (const ts of boundariesRef.current) {
      const x = chartRef.current.timeScale().timeToCoordinate(ts);
      if (x === null || x < 0 || x > w) continue;
      ctx.save();
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
      ctx.restore();
    }
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;

    const panel = cssVar("--color-panel", "#121214");
    const border = cssVar("--color-border", "#1f1f21");
    const text5 = cssVar("--color-text-5", "#44433F");
    const text6 = cssVar("--color-text-6", "#2F2E2C");
    const skewMoving = cssVar("--color-skew-moving", "#9B7BB3");

    const chart = createChart(containerRef.current, {
      layout: {
        background: { color: panel },
        textColor: text5,
      },
      grid: {
        vertLines: { color: border },
        horzLines: { color: border },
      },
      crosshair: {
        vertLine: { color: text6 },
        horzLine: { color: text6 },
      },
      rightPriceScale: {
        borderColor: border,
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
        borderColor: border,
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
      color: skewMoving,
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
          color: "rgba(232, 230, 224, 0.10)",
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

    if (avgLineRef.current) {
      try {
        seriesRef.current.removePriceLine(avgLineRef.current);
      } catch {}
      avgLineRef.current = null;
    }

    if (avgSkew !== null) {
      try {
        avgLineRef.current = seriesRef.current.createPriceLine({
          price: avgSkew,
          color: cssVar("--color-text-4", "#555350"),
          lineWidth: 1,
          lineStyle: 2,
          axisLabelTextColor: cssVar("--color-page", "#0a0a0a"),
          axisLabelVisible: true,
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
        <span className="font-sans text-xs text-text-4 uppercase tracking-wide">
          25Δ Skew
        </span>
        {avgSkew !== null && (
          <span className="font-mono text-xs text-text-5">
            média {avgSkew.toFixed(3)}
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
