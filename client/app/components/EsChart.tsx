"use client";

import { useEffect, useRef } from "react";
import {
  createChart,
  LineSeries,
  UTCTimestamp,
  ISeriesApi,
  SeriesType,
  IChartApi,
  CrosshairMode,
} from "lightweight-charts";
import { EsSnapshot } from "../types";

type Props = {
  data: EsSnapshot[];
  selectedDate: string;
  currentPrice?: number | null;
};

function isToday(selectedDate: string): boolean {
  return (
    selectedDate ===
    new Date().toLocaleDateString("en-CA", {
      timeZone: "America/New_York",
    })
  );
}

export default function EsChart({ data, selectedDate, currentPrice }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const seriesRef = useRef<ISeriesApi<SeriesType> | null>(null);
  const chartRef = useRef<IChartApi | null>(null);

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
        mode: CrosshairMode.Magnet,
        vertLine: { color: "#333333" },
        horzLine: { color: "#333333" },
      },
      rightPriceScale: {
        visible: true,
        borderColor: "#1f1f1f",
        textColor: "#444444",
        scaleMargins: {
          top: 0.1,
          bottom: 0.1,
        },
      },
      localization: {
        timeFormatter: (time: number) =>
          new Date(time * 1000).toLocaleTimeString("en-US", {
            timeZone: "America/Chicago",
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          }),
      },
      timeScale: {
        borderColor: "#1f1f1f",
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 60,
        tickMarkFormatter: (time: number) =>
          new Date(time * 1000).toLocaleTimeString("en-US", {
            timeZone: "America/Chicago",
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          }),
      },
      width: containerRef.current.clientWidth,
      height: 400,
    });

    const series = chart.addSeries(LineSeries, {
      color: "#737373",
      lineWidth: 1,
      priceLineVisible: true,
      priceLineStyle: 1,
      priceLineColor: "#CF7C00",
      lastValueVisible: true,
      title: "ES",
    });

    seriesRef.current = series;
    chartRef.current = chart;

    const handleResize = () => {
      if (containerRef.current)
        chart.applyOptions({ width: containerRef.current.clientWidth });
    };
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      chart.remove();
    };
  }, []);

  // Historical data
  useEffect(() => {
    if (!seriesRef.current || !chartRef.current) return;

    const points = data
      .map((s) => ({
        time: Math.floor(
          new Date(s.created_at).getTime() / 1000,
        ) as UTCTimestamp,
        value: s.es_ref,
      }))
      .filter((p, i, arr) => i === 0 || p.time > arr[i - 1].time);

    seriesRef.current.setData(points);

    try {
      if (points.length > 0) {
        chartRef.current.timeScale().fitContent();
      } else {
        const now = Math.floor(Date.now() / 1000) as UTCTimestamp;
        const sixHoursAgo = (now - 6 * 60 * 60) as UTCTimestamp;
        chartRef.current
          .timeScale()
          .setVisibleRange({ from: sixHoursAgo, to: now });
      }
    } catch {}
  }, [data, selectedDate]);

  // Live tick — rounded to minute
  useEffect(() => {
    if (!seriesRef.current || !currentPrice) return;
    if (!isToday(selectedDate)) return;
    const nowMinute = (Math.floor(Date.now() / 60000) * 60) as UTCTimestamp;
    try {
      seriesRef.current.update({ time: nowMinute, value: currentPrice });
    } catch {}
  }, [currentPrice, selectedDate]);

  return (
    <div ref={containerRef} className="w-full rounded-sm overflow-hidden" />
  );
}