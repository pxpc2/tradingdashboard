"use client";

import { useEffect, useRef, useCallback } from "react";
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
import { EsSnapshot, ChartRange } from "../types";
import { PharmLevel } from "../hooks/usePharmLevels";

type Props = {
  data: EsSnapshot[];
  selectedDate: string;
  currentPrice?: number | null;
  weeklyLevels?: PharmLevel[];
  dailyLevels?: PharmLevel[];
  onh?: number | null;
  onl?: number | null;
  range: ChartRange;
};

function isToday(selectedDate: string): boolean {
  return (
    selectedDate ===
    new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" })
  );
}

const WEEKLY = { color: "#3b4f7a", width: 2, style: LineStyle.Dashed };
const DAILY = { color: "#444444", width: 2, style: LineStyle.Dashed };

function makeTimeFormatter(range: ChartRange) {
  const showDate = range === "3D" || range === "5D";
  return (time: number) => {
    const d = new Date(time * 1000);
    if (showDate) {
      return d.toLocaleString("en-US", {
        timeZone: "America/Chicago",
        month: "numeric",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
    }
    return d.toLocaleTimeString("en-US", {
      timeZone: "America/Chicago",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  };
}

function rangeToSeconds(range: ChartRange): number | null {
  switch (range) {
    case "1H":
      return 3600;
    case "4H":
      return 14400;
    default:
      return null;
  }
}

function findDayBoundaries(data: EsSnapshot[]): UTCTimestamp[] {
  const boundaries: UTCTimestamp[] = [];
  for (let i = 1; i < data.length; i++) {
    const prevTime = new Date(data[i - 1].created_at).toLocaleTimeString(
      "en-US",
      {
        timeZone: "America/New_York",
        hour12: false,
        hour: "2-digit",
        minute: "2-digit",
      },
    );
    const currTime = new Date(data[i].created_at).toLocaleTimeString("en-US", {
      timeZone: "America/New_York",
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
    });
    if (prevTime < "16:00" && currTime >= "16:00") {
      boundaries.push(
        Math.floor(
          new Date(data[i].created_at).getTime() / 1000,
        ) as UTCTimestamp,
      );
    }
  }
  return boundaries;
}

export default function EsChart({
  data,
  selectedDate,
  currentPrice,
  weeklyLevels = [],
  dailyLevels = [],
  onh,
  onl,
  range,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const seriesRef = useRef<ISeriesApi<SeriesType> | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const pharmLinesRef = useRef<IPriceLine[]>([]);
  const onhLineRef = useRef<IPriceLine | null>(null);
  const onlLineRef = useRef<IPriceLine | null>(null);
  const boundariesRef = useRef<UTCTimestamp[]>([]);
  const rangeRef = useRef<ChartRange>(range);

  const drawSeparators = useCallback(() => {
    if (!overlayRef.current || !chartRef.current || !containerRef.current)
      return;
    const canvas = overlayRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = containerRef.current.clientWidth;
    const h = 400;
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
      ctx.strokeStyle = "#949494";
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
    const chart = createChart(containerRef.current, {
      layout: { background: { color: "#111111" }, textColor: "#444444" },
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
      timeScale: {
        borderColor: "#1f1f1f",
        timeVisible: true,
        secondsVisible: false,
        shiftVisibleRangeOnNewBar: false,
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
        { text: "ES futs", color: "rgba(204, 204, 204, 0.2)", fontSize: 24 },
      ],
    });

    seriesRef.current = series;
    chartRef.current = chart;

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

  // Update formatter when range changes
  useEffect(() => {
    rangeRef.current = range;
    if (!chartRef.current) return;
    const fmt = makeTimeFormatter(range);
    chartRef.current.applyOptions({
      localization: { timeFormatter: fmt },
      timeScale: { tickMarkFormatter: fmt },
    });
    drawSeparators();
  }, [range, drawSeparators]);

  // Historical data + zoom
  useEffect(() => {
    if (!seriesRef.current || !chartRef.current) return;

    boundariesRef.current = findDayBoundaries(data);

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
        const secs = rangeToSeconds(range);
        if (secs !== null) {
          const now = Math.floor(Date.now() / 1000) as UTCTimestamp;
          chartRef.current
            .timeScale()
            .setVisibleRange({ from: (now - secs) as UTCTimestamp, to: now });
        } else {
          chartRef.current.timeScale().fitContent();
        }
      } else {
        const now = Math.floor(Date.now() / 1000) as UTCTimestamp;
        chartRef.current.timeScale().setVisibleRange({
          from: (now - 6 * 60 * 60) as UTCTimestamp,
          to: now,
        });
      }
    } catch {}

    drawSeparators();
  }, [data, selectedDate, range, drawSeparators]);

  // Pharm levels
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
      pharmLinesRef.current.push(
        seriesRef.current.createPriceLine({
          price: level.high,
          color: style.color,
          lineWidth: style.width as 1 | 2 | 3 | 4,
          lineStyle: style.style,
          axisLabelVisible: false,
          title,
        }),
      );
      if (level.low !== null) {
        pharmLinesRef.current.push(
          seriesRef.current.createPriceLine({
            price: level.low,
            color: style.color,
            lineWidth: style.width as 1 | 2 | 3 | 4,
            lineStyle: style.style,
            axisLabelVisible: false,
            title: "",
          }),
        );
      }
    }
  }, [weeklyLevels, dailyLevels, selectedDate]);

  // ONH/ONL
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
    if (onh)
      onhLineRef.current = seriesRef.current.createPriceLine({
        price: onh,
        color: "#265C4D",
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: "ONH",
      });
    if (onl)
      onlLineRef.current = seriesRef.current.createPriceLine({
        price: onl,
        color: "#265C4D",
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: "ONL",
      });
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
    <div style={{ position: "relative" }}>
      <div ref={containerRef} className="w-full rounded-sm overflow-hidden" />
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
  );
}
