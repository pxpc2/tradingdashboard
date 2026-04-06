"use client";

import { useEffect, useRef } from "react";
import {
  createChart,
  LineSeries,
  UTCTimestamp,
  ISeriesApi,
  SeriesType,
  IChartApi,
  IPriceLine,
  CrosshairMode,
} from "lightweight-charts";
import { EsSnapshot } from "../types";

type Props = {
  data: EsSnapshot[];
  selectedDate: string;
  currentPrice?: number | null;
  pdh?: number | null;
  pdl?: number | null;
};

export default function EsChart({
  data,
  selectedDate,
  currentPrice,
  pdh,
  pdl,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const seriesRef = useRef<ISeriesApi<SeriesType> | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const pdhLineRef = useRef<IPriceLine | null>(null);
  const pdlLineRef = useRef<IPriceLine | null>(null);

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

  // Historical data — show full day including overnight
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

    // Show full day — midnight to midnight CT
    const dayStart = Math.floor(
      new Date(`${selectedDate}T06:00:00Z`).getTime() / 1000,
    ) as UTCTimestamp;
    const dayEnd = Math.floor(
      new Date(`${selectedDate}T22:00:00Z`).getTime() / 1000,
    ) as UTCTimestamp;

    try {
      if (points.length > 0) {
        chartRef.current.timeScale().fitContent();
      } else {
        chartRef.current
          .timeScale()
          .setVisibleRange({ from: dayStart, to: dayEnd });
      }
    } catch {}
  }, [data, selectedDate]);

  // PDH/PDL lines
  useEffect(() => {
    if (!seriesRef.current) return;

    if (pdhLineRef.current) {
      try {
        seriesRef.current.removePriceLine(pdhLineRef.current);
      } catch {}
      pdhLineRef.current = null;
    }
    if (pdlLineRef.current) {
      try {
        seriesRef.current.removePriceLine(pdlLineRef.current);
      } catch {}
      pdlLineRef.current = null;
    }

    if (pdh) {
      pdhLineRef.current = seriesRef.current.createPriceLine({
        price: pdh,
        color: "#265C4D",
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: true,
        title: "PDH",
      });
    }
    if (pdl) {
      pdlLineRef.current = seriesRef.current.createPriceLine({
        price: pdl,
        color: "#265C4D",
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: true,
        title: "PDL",
      });
    }
  }, [pdh, pdl]);

  // Live tick
  useEffect(() => {
    if (!seriesRef.current || !currentPrice) return;
    const now = Math.floor(Date.now() / 1000) as UTCTimestamp;
    try {
      seriesRef.current.update({ time: now, value: currentPrice });
    } catch {}
  }, [currentPrice]);

  return (
    <div ref={containerRef} className="w-full rounded-sm overflow-hidden" />
  );
}
