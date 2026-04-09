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

export default function SpxChart({
  data,
  selectedDate,
  pdh,
  pdl,
  currentPrice,
  range,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const seriesRef = useRef<ISeriesApi<SeriesType> | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const upperLineRef = useRef<IPriceLine | null>(null);
  const lowerLineRef = useRef<IPriceLine | null>(null);
  const pdhLineRef = useRef<IPriceLine | null>(null);
  const pdlLineRef = useRef<IPriceLine | null>(null);

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

  // Update time formatter when range changes
  useEffect(() => {
    if (!chartRef.current) return;
    const fmt = makeTimeFormatter(range);
    chartRef.current.applyOptions({
      localization: { timeFormatter: fmt },
      timeScale: { tickMarkFormatter: fmt },
    });
  }, [range]);

  // Data + implied move lines + zoom
  useEffect(() => {
    if (!seriesRef.current || !chartRef.current) return;

    const points = data
      .map((s) => ({
        time: Math.floor(
          new Date(s.created_at).getTime() / 1000,
        ) as UTCTimestamp,
        value: s.spx_ref,
      }))
      .filter((p, i, arr) => i === 0 || p.time > arr[i - 1].time);

    seriesRef.current.setData(points);

    // Clear implied lines
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

    // Only show implied lines on 1D view
    if (data.length > 0 && range === "1D") {
      const openingStraddle = data[0].straddle_mid;
      const openingStrike = data[0].atm_strike;
      upperLineRef.current = seriesRef.current.createPriceLine({
        price: openingStrike + openingStraddle,
        color: "#265C4D",
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: true,
        title: "Implied High",
      });
      lowerLineRef.current = seriesRef.current.createPriceLine({
        price: openingStrike - openingStraddle,
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
          const now = Math.floor(Date.now() / 1000) as UTCTimestamp;
          const from = (now - secs) as UTCTimestamp;
          chartRef.current.timeScale().setVisibleRange({ from, to: now });
        } else {
          chartRef.current.timeScale().fitContent();
        }
      }
    } catch {}
  }, [data, selectedDate, range]);

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
