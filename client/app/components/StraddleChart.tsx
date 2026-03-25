"use client";

import { useEffect, useRef } from "react";
import {
  createChart,
  LineSeries,
  UTCTimestamp,
  ISeriesApi,
  SeriesType,
} from "lightweight-charts";

type StraddleSnapshot = {
  id: string;
  created_at: string;
  spx_ref: number;
  atm_strike: number;
  call_bid: number;
  call_ask: number;
  put_bid: number;
  put_ask: number;
  straddle_mid: number;
};

type Props = {
  data: StraddleSnapshot[];
};

export default function StraddleChart({ data }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const seriesRef = useRef<ISeriesApi<SeriesType> | null>(null);

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

    const series = chart.addSeries(LineSeries, {
      color: "#A8A8A8",
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: true,
    });

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

  // Runs whenever data changes — handles both date switches and realtime appends
  useEffect(() => {
    if (!seriesRef.current) return;

    const points = data
      .map((snapshot) => ({
        time: Math.floor(
          new Date(snapshot.created_at).getTime() / 1000,
        ) as UTCTimestamp,
        value: snapshot.straddle_mid,
      }))
      .filter(
        (point, index, arr) => index === 0 || point.time > arr[index - 1].time,
      );

    seriesRef.current.setData(points);
  }, [data]);

  return (
    <div ref={containerRef} className="w-full rounded-sm overflow-hidden" />
  );
}
