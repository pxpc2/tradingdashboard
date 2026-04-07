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
  LineStyle,
  createTextWatermark,
} from "lightweight-charts";
import { EsSnapshot } from "../types";
import { PharmLevel } from "../hooks/usePharmLevels";

type Props = {
  data: EsSnapshot[];
  selectedDate: string;
  currentPrice?: number | null;
  weeklyLevels?: PharmLevel[];
  dailyLevels?: PharmLevel[];
  onh?: number | null;
  onl?: number | null;
};

function isToday(selectedDate: string): boolean {
  return (
    selectedDate ===
    new Date().toLocaleDateString("en-CA", {
      timeZone: "America/New_York",
    })
  );
}

const WEEKLY = { color: "#3b4f7a", width: 2, style: LineStyle.Dashed };
const DAILY = { color: "#444444", width: 2, style: LineStyle.Dashed };

export default function EsChart({
  data,
  selectedDate,
  currentPrice,
  weeklyLevels = [],
  dailyLevels = [],
  onh,
  onl,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const seriesRef = useRef<ISeriesApi<SeriesType> | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const pharmLinesRef = useRef<IPriceLine[]>([]);
  const onhLineRef = useRef<IPriceLine | null>(null);
  const onlLineRef = useRef<IPriceLine | null>(null);

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
        scaleMargins: { top: 0.1, bottom: 0.1 },
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

    createTextWatermark(chart.panes()[0], {
      horzAlign: "center",
      vertAlign: "center",
      lines: [
        {
          text: "ES futs",
          color: "rgba(204, 204, 204, 0.2)",
          fontSize: 24,
        },
      ],
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

  // Pharm levels — only on today
  useEffect(() => {
    if (!seriesRef.current) return;

    for (const line of pharmLinesRef.current) {
      try {
        seriesRef.current.removePriceLine(line);
      } catch {}
    }
    pharmLinesRef.current = [];

    if (!isToday(selectedDate)) return;

    const allLevels = [
      ...weeklyLevels.map((l) => ({ ...l, source: "weekly" as const })),
      ...dailyLevels.map((l) => ({ ...l, source: "daily" as const })),
    ];

    for (const level of allLevels) {
      const style = level.source === "weekly" ? WEEKLY : DAILY;

      const rangeStr =
        level.low !== null ? `${level.low}-${level.high}` : `${level.high}`;
      const title = level.label ? `${rangeStr} ${level.label}` : rangeStr;

      const topLine = seriesRef.current.createPriceLine({
        price: level.high,
        color: style.color,
        lineWidth: style.width as 1 | 2 | 3 | 4,
        lineStyle: style.style,
        axisLabelVisible: false,
        title,
      });
      pharmLinesRef.current.push(topLine);

      if (level.low !== null) {
        const bottomLine = seriesRef.current.createPriceLine({
          price: level.low,
          color: style.color,
          lineWidth: style.width as 1 | 2 | 3 | 4,
          lineStyle: style.style,
          axisLabelVisible: false,
          title: "",
        });
        pharmLinesRef.current.push(bottomLine);
      }
    }
  }, [weeklyLevels, dailyLevels, selectedDate]);

  // ONH/ONL — only on today during RTH
  useEffect(() => {
    if (!seriesRef.current) return;

    if (onhLineRef.current) {
      try {
        seriesRef.current.removePriceLine(onhLineRef.current);
      } catch {}
      onhLineRef.current = null;
    }
    if (onlLineRef.current) {
      try {
        seriesRef.current.removePriceLine(onlLineRef.current);
      } catch {}
      onlLineRef.current = null;
    }

    if (!isToday(selectedDate)) return;

    if (onh) {
      onhLineRef.current = seriesRef.current.createPriceLine({
        price: onh,
        color: "#2a6b6b",
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: "ONH",
      });
    }

    if (onl) {
      onlLineRef.current = seriesRef.current.createPriceLine({
        price: onl,
        color: "#2a6b6b",
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: "ONL",
      });
    }
  }, [onh, onl, selectedDate]);

  // Live tick
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
