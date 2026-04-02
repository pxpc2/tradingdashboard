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
  AreaSeries,
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
  selectedDate: string;
  pdh?: number | null;
  pdl?: number | null;
};

export default function StraddleChart({ data, selectedDate, pdh, pdl }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const straddleSeriesRef = useRef<ISeriesApi<SeriesType> | null>(null);
  const spxSeriesRef = useRef<ISeriesApi<SeriesType> | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const upperLineRef = useRef<IPriceLine | null>(null);
  const lowerLineRef = useRef<IPriceLine | null>(null);
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
      leftPriceScale: {
        visible: true,
        borderColor: "#1f1f1f",
        textColor: "#444444",
      },
      rightPriceScale: {
        visible: true,
        borderColor: "#1f1f1f",
        textColor: "#444444",
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

    const straddleSeries = chart.addSeries(AreaSeries, {
      lineColor: "#9CA9FF",
      topColor: "#9CA9FF33",
      bottomColor: "#9CA9FF00",
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: true,
      title: "Straddle",
    });

    const spxSeries = chart.addSeries(LineSeries, {
      color: "#AD6800",
      lineWidth: 1,
      priceLineVisible: true,
      priceLineStyle: 1,
      lastValueVisible: true,
      priceScaleId: "left",
      title: "SPX",
    });

    straddleSeriesRef.current = straddleSeries;
    spxSeriesRef.current = spxSeries;
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

  // Update data and expected move lines
  useEffect(() => {
    if (
      !straddleSeriesRef.current ||
      !spxSeriesRef.current ||
      !chartRef.current
    )
      return;

    const straddlePoints = data
      .map((snapshot) => ({
        time: Math.floor(
          new Date(snapshot.created_at).getTime() / 1000,
        ) as UTCTimestamp,
        value: snapshot.straddle_mid,
      }))
      .filter(
        (point, index, arr) => index === 0 || point.time > arr[index - 1].time,
      );

    const spxPoints = data
      .map((snapshot) => ({
        time: Math.floor(
          new Date(snapshot.created_at).getTime() / 1000,
        ) as UTCTimestamp,
        value: snapshot.spx_ref,
      }))
      .filter(
        (point, index, arr) => index === 0 || point.time > arr[index - 1].time,
      );

    straddleSeriesRef.current.setData(straddlePoints);
    spxSeriesRef.current.setData(spxPoints);

    // Remove and re-add expected move lines
    if (upperLineRef.current) {
      try {
        spxSeriesRef.current.removePriceLine(upperLineRef.current);
      } catch {}
      upperLineRef.current = null;
    }
    if (lowerLineRef.current) {
      try {
        spxSeriesRef.current.removePriceLine(lowerLineRef.current);
      } catch {}
      lowerLineRef.current = null;
    }

    if (data.length > 0) {
      const openingStraddle = data[0].straddle_mid;
      const openingStrike = data[0].atm_strike;

      upperLineRef.current = spxSeriesRef.current.createPriceLine({
        price: openingStrike + openingStraddle,
        color: "#006C70",
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: true,
        title: "Implied High",
      });

      lowerLineRef.current = spxSeriesRef.current.createPriceLine({
        price: openingStrike - openingStraddle,
        color: "#006C70",
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: true,
        title: "Implied Low",
      });
    }

    const marketOpen = Math.floor(
      new Date(`${selectedDate}T13:30:00Z`).getTime() / 1000,
    ) as UTCTimestamp;
    const marketClose = Math.floor(
      new Date(`${selectedDate}T20:00:00Z`).getTime() / 1000,
    ) as UTCTimestamp;

    try {
      chartRef.current
        .timeScale()
        .setVisibleRange({ from: marketOpen, to: marketClose });
    } catch {}
  }, [data, selectedDate]);

  // PDH/PDL lines — separate effect so they update independently
  useEffect(() => {
    if (!spxSeriesRef.current) return;

    if (pdhLineRef.current) {
      try {
        spxSeriesRef.current.removePriceLine(pdhLineRef.current);
      } catch {}
      pdhLineRef.current = null;
    }
    if (pdlLineRef.current) {
      try {
        spxSeriesRef.current.removePriceLine(pdlLineRef.current);
      } catch {}
      pdlLineRef.current = null;
    }

    if (pdh) {
      pdhLineRef.current = spxSeriesRef.current.createPriceLine({
        price: pdh,
        color: "#265C4D",
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: true,
        title: "PDH",
      });
    }

    if (pdl) {
      pdlLineRef.current = spxSeriesRef.current.createPriceLine({
        price: pdl,
        color: "#265C4D",
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: true,
        title: "PDL",
      });
    }
  }, [pdh, pdl]);

  return (
    <div ref={containerRef} className="w-full rounded-sm overflow-hidden" />
  );
}
