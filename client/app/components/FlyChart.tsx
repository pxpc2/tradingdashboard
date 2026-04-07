"use client";

import { useEffect, useRef } from "react";
import {
  createChart,
  AreaSeries,
  UTCTimestamp,
  ISeriesApi,
  SeriesType,
  IChartApi,
  createTextWatermark,
} from "lightweight-charts";

type FlySnapshot = {
  id: string;
  created_at: string;
  session_id: string;
  width: number;
  mid: number;
  bid: number;
  ask: number;
};

type Props = {
  data: FlySnapshot[];
  width: number;
  color: string;
  selectedDate: string;
};

export default function FlyChart({ data, width, color, selectedDate }: Props) {
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
        vertLine: { color: "#333333" },
        horzLine: { color: "#333333" },
      },
      rightPriceScale: {
        borderColor: "#1f1f1f",
      },
      localization: {
        timeFormatter: (time: number) => {
          return new Date(time * 1000).toLocaleTimeString("en-US", {
            timeZone: "America/Chicago",
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          });
        },
      },
      timeScale: {
        borderColor: "#1f1f1f",
        timeVisible: true,
        secondsVisible: false,
        tickMarkFormatter: (time: number) => {
          return new Date(time * 1000).toLocaleTimeString("en-US", {
            timeZone: "America/Chicago",
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          });
        },
      },
      width: containerRef.current.clientWidth,
      height: 400,
    });

    const series = chart.addSeries(AreaSeries, {
      lineColor: color,
      topColor: `${color}33`,
      bottomColor: `${color}00`,
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: true,
    });

    createTextWatermark(chart.panes()[0], {
      horzAlign: "center",
      vertAlign: "center",
      lines: [
        {
          text: `vovonacci - SML ${width}W fly`,
          color: "rgba(204, 204, 204, 0.2)",
          fontSize: 24,
        },
      ],
    });

    seriesRef.current = series;
    chartRef.current = chart;

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

  useEffect(() => {
    if (!seriesRef.current || !chartRef.current) return;

    const points = data
      .map((snapshot) => ({
        time: Math.floor(
          new Date(snapshot.created_at).getTime() / 1000,
        ) as UTCTimestamp,
        value: snapshot.mid,
      }))
      .filter(
        (point, index, arr) => index === 0 || point.time > arr[index - 1].time,
      );

    seriesRef.current.setData(points);

    const marketOpen = Math.floor(
      new Date(`${selectedDate}T13:30:00Z`).getTime() / 1000,
    ) as UTCTimestamp;
    const marketClose = Math.floor(
      new Date(`${selectedDate}T20:00:00Z`).getTime() / 1000,
    ) as UTCTimestamp;

    try {
      chartRef.current.timeScale().setVisibleRange({
        from: marketOpen,
        to: marketClose,
      });
    } catch {
      // chart not ready yet
    }
  }, [data, selectedDate]);

  return (
    <div ref={containerRef} className="w-full rounded-sm overflow-hidden" />
  );
}
