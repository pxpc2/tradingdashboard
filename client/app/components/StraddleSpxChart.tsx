"use client";

import { useEffect, useRef } from "react";
import {
  createChart,
  AreaSeries,
  LineSeries,
  UTCTimestamp,
  ISeriesApi,
  SeriesType,
  IChartApi,
  createTextWatermark,
} from "lightweight-charts";
import { StraddleSnapshot } from "../types";

type Props = {
  data: StraddleSnapshot[];
  currentSpxPrice: number | null;
};

export default function StraddleSpxChart({ data, currentSpxPrice }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const straddleSeriesRef = useRef<ISeriesApi<SeriesType> | null>(null);
  const spxSeriesRef = useRef<ISeriesApi<SeriesType> | null>(null);

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
      leftPriceScale: {
        visible: true,
        borderColor: "#1f1f1f",
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
        shiftVisibleRangeOnNewBar: false,
        tickMarkFormatter: (time: number) =>
          new Date(time * 1000).toLocaleTimeString("en-US", {
            timeZone: "America/Chicago",
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          }),
      },
      width: containerRef.current.clientWidth,
      height: 150,
    });

    // Straddle area series (right price scale)
    const straddleSeries = chart.addSeries(AreaSeries, {
      lineColor: "#9CA9FF",
      topColor: "#9CA9FF33",
      bottomColor: "#9CA9FF00",
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: true,
      title: "STR",
      priceScaleId: "right",
    });

    // SPX line series (left price scale)
    const spxSeries = chart.addSeries(LineSeries, {
      color: "#737373",
      lineWidth: 1,
      lineStyle: 2, // dashed
      priceLineVisible: false,
      lastValueVisible: true,
      title: "SPX",
      priceScaleId: "left",
    });

    createTextWatermark(chart.panes()[0], {
      horzAlign: "center",
      vertAlign: "center",
      lines: [
        {
          text: "0DTE Straddle + SPX",
          color: "rgba(204, 204, 204, 0.15)",
          fontSize: 18,
        },
      ],
    });

    chartRef.current = chart;
    straddleSeriesRef.current = straddleSeries;
    spxSeriesRef.current = spxSeries;

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
    if (
      !straddleSeriesRef.current ||
      !spxSeriesRef.current ||
      !chartRef.current
    )
      return;

    // Straddle points
    const straddlePoints = data
      .map((s) => ({
        time: Math.floor(
          new Date(s.created_at).getTime() / 1000,
        ) as UTCTimestamp,
        value: s.straddle_mid,
      }))
      .filter((p, i, arr) => i === 0 || p.time > arr[i - 1].time);

    // SPX points
    const spxPoints = data
      .map((s) => ({
        time: Math.floor(
          new Date(s.created_at).getTime() / 1000,
        ) as UTCTimestamp,
        value: s.spx_ref,
      }))
      .filter((p, i, arr) => i === 0 || p.time > arr[i - 1].time);

    straddleSeriesRef.current.setData(straddlePoints);
    spxSeriesRef.current.setData(spxPoints);

    // Fit to today's session
    try {
      chartRef.current.timeScale().fitContent();
    } catch {}
  }, [data]);

  // Live SPX tick
  useEffect(() => {
    if (!spxSeriesRef.current || !currentSpxPrice) return;
    const nowMinute = (Math.floor(Date.now() / 60000) * 60) as UTCTimestamp;
    try {
      spxSeriesRef.current.update({ time: nowMinute, value: currentSpxPrice });
    } catch {}
  }, [currentSpxPrice]);

  return (
    <div>
      <div className="flex justify-between items-center mb-1.5">
        <span className="font-sans text-xs text-[#555] uppercase tracking-wide">
          IV vs RV
        </span>
        <div className="flex gap-3 text-xs">
          <span className="flex items-center gap-1">
            <span className="inline-block w-2.5 h-0.5 bg-[#9CA9FF]" />
            <span className="text-[#666]">Straddle</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-2.5 h-0.5 bg-[#737373]" />
            <span className="text-[#666]">SPX</span>
          </span>
        </div>
      </div>
      <div ref={containerRef} className="w-full rounded overflow-hidden" />
    </div>
  );
}
