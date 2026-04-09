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
  createTextWatermark,
} from "lightweight-charts";
import { StraddleSnapshot, ChartRange } from "../types";

type Props = {
  data: StraddleSnapshot[];
  selectedDate: string;
  pdh?: number | null;
  pdl?: number | null;
  currentPrice?: number | null;
  range: ChartRange;
};

function isToday(selectedDate: string): boolean {
  return (
    selectedDate ===
    new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" })
  );
}

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

function findDayBoundaries(data: StraddleSnapshot[]): UTCTimestamp[] {
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

export default function SpxChart({
  data,
  selectedDate,
  pdh,
  pdl,
  currentPrice,
  range,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const seriesRef = useRef<ISeriesApi<SeriesType> | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const upperLineRef = useRef<IPriceLine | null>(null);
  const lowerLineRef = useRef<IPriceLine | null>(null);
  const pdhLineRef = useRef<IPriceLine | null>(null);
  const pdlLineRef = useRef<IPriceLine | null>(null);
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
        rightOffset: 15,
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
      title: "SPX",
    });

    createTextWatermark(chart.panes()[0], {
      horzAlign: "center",
      vertAlign: "center",
      lines: [
        { text: "SPX index", color: "rgba(204, 204, 204, 0.2)", fontSize: 24 },
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

  // Data + implied lines + zoom
  useEffect(() => {
    if (!seriesRef.current || !chartRef.current) return;

    boundariesRef.current = findDayBoundaries(data);

    const points = data
      .map((s) => ({
        time: Math.floor(
          new Date(s.created_at).getTime() / 1000,
        ) as UTCTimestamp,
        value: s.spx_ref,
      }))
      .filter((p, i, arr) => i === 0 || p.time > arr[i - 1].time);

    seriesRef.current.setData(points);

    // Find today's opening row — works correctly regardless of multi-day data
    const todayOpening =
      data.find(
        (s) =>
          new Date(s.created_at).toLocaleDateString("en-CA", {
            timeZone: "America/New_York",
          }) === selectedDate,
      ) ?? null;

    if (upperLineRef.current) {
      try {
        seriesRef.current.removePriceLine(upperLineRef.current);
      } catch {}
      upperLineRef.current = null;
    }
    if (lowerLineRef.current) {
      try {
        seriesRef.current.removePriceLine(lowerLineRef.current);
      } catch {}
      lowerLineRef.current = null;
    }

    if (todayOpening) {
      upperLineRef.current = seriesRef.current.createPriceLine({
        price: todayOpening.atm_strike + todayOpening.straddle_mid,
        color: "#265C4D",
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: true,
        title: "Implied High",
      });
      lowerLineRef.current = seriesRef.current.createPriceLine({
        price: todayOpening.atm_strike - todayOpening.straddle_mid,
        color: "#265C4D",
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: true,
        title: "Implied Low",
      });
    }

    try {
      if (points.length > 0) {
        const secs = rangeToSeconds(range);
        if (secs !== null) {
          // 1H/4H — zoom to last N seconds
          const now = Math.floor(Date.now() / 1000) as UTCTimestamp;
          chartRef.current.timeScale().setVisibleRange({
            from: (now - secs) as UTCTimestamp,
            to: now,
          });
        } else if (range === "1D") {
          // 1D only — fit today's session
          chartRef.current.timeScale().fitContent();
        }
        // 3D/5D — do nothing, let user control the view freely
      }
    } catch {}

    drawSeparators();
  }, [data, selectedDate, range, drawSeparators]);

  // PDH/PDL
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
    if (pdh)
      pdhLineRef.current = seriesRef.current.createPriceLine({
        price: pdh,
        color: "#265C4D",
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: true,
        title: "PDH",
      });
    if (pdl)
      pdlLineRef.current = seriesRef.current.createPriceLine({
        price: pdl,
        color: "#265C4D",
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: true,
        title: "PDL",
      });
  }, [pdh, pdl]);

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
