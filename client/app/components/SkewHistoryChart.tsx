"use client";

import { useEffect, useRef, useMemo } from "react";
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

export default function SkewHistoryChart({ data, avgSkew }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<SeriesType> | null>(null);

  // Get today's date for highlighting
  const today = useMemo(
    () =>
      new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" }),
    [],
  );

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

    const handleResize = () => {
      if (containerRef.current) {
        chart.applyOptions({ width: containerRef.current.clientWidth });
      }
    };
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      chart.remove();
    };
  }, []);

  // Data updates
  useEffect(() => {
    if (!seriesRef.current || !chartRef.current) return;

    // Show all 5-min data points (full resolution)
    const points = data
      .map((s) => ({
        time: Math.floor(new Date(s.created_at).getTime() / 1000) as UTCTimestamp,
        value: s.skew,
      }))
      .filter((p, i, arr) => i === 0 || p.time > arr[i - 1].time);

    seriesRef.current.setData(points);

    // Add average line if we have data
    if (avgSkew !== null) {
      try {
        seriesRef.current.createPriceLine({
          price: avgSkew,
          color: "#333",
          lineWidth: 1,
          lineStyle: 2, // dashed
          axisLabelVisible: false,
          title: "",
        });
      } catch {}
    }

    try {
      chartRef.current.timeScale().fitContent();
    } catch {}
  }, [data, avgSkew]);

  const latestSkew = data[data.length - 1]?.skew ?? null;

  return (
    <div>
      <div className="flex justify-between items-center mb-1.5">
        <span className="font-sans text-xs text-[#555] uppercase tracking-wide">
          25Δ Skew — All History
        </span>
        {avgSkew !== null && (
          <span className="font-mono text-xs text-[#444]">
            avg {avgSkew.toFixed(3)}
          </span>
        )}
      </div>
      <div ref={containerRef} className="w-full rounded overflow-hidden" />
    </div>
  );
}
