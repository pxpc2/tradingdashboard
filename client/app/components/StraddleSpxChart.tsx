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
  IPriceLine,
  createTextWatermark,
} from "lightweight-charts";
import { StraddleSnapshot, SkewSnapshot } from "../types";
import { cssVar } from "../lib/theme";

type Props = {
  data: StraddleSnapshot[];
  currentSpxPrice: number | null;
  openingSkew: SkewSnapshot | null;
};

export default function StraddleSpxChart({
  data,
  currentSpxPrice,
  openingSkew,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const straddleSeriesRef = useRef<ISeriesApi<SeriesType> | null>(null);
  const spxSeriesRef = useRef<ISeriesApi<SeriesType> | null>(null);
  const downsideLineRef = useRef<IPriceLine | null>(null);
  const upsideLineRef = useRef<IPriceLine | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // Resolve CSS vars at chart creation (client-side, after mount)
    const panel = cssVar("--color-panel", "#121214");
    const border = cssVar("--color-border", "#1f1f21");
    const text5 = cssVar("--color-text-5", "#44433F");
    const text6 = cssVar("--color-text-6", "#2F2E2C");
    const skewMoving = cssVar("--color-skew-moving", "#9B7BB3");
    const text3 = cssVar("--color-text-3", "#6E6C67");

    const chart = createChart(containerRef.current, {
      layout: {
        background: { color: panel },
        textColor: text5,
      },
      grid: {
        vertLines: { color: border },
        horzLines: { color: border },
      },
      crosshair: {
        vertLine: { color: text6 },
        horzLine: { color: text6 },
      },
      rightPriceScale: {
        borderColor: border,
        scaleMargins: { top: 0.1, bottom: 0.1 },
      },
      leftPriceScale: {
        visible: true,
        borderColor: border,
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
        borderColor: border,
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

    const straddleSeries = chart.addSeries(AreaSeries, {
      lineColor: skewMoving,
      topColor: `${skewMoving}33`,
      bottomColor: `${skewMoving}00`,
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: true,
      title: "STR",
      priceScaleId: "right",
    });

    const spxSeries = chart.addSeries(LineSeries, {
      color: text3,
      lineWidth: 1,
      lineStyle: 2,
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
          color: "rgba(232, 230, 224, 0.10)",
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

  useEffect(() => {
    if (
      !straddleSeriesRef.current ||
      !spxSeriesRef.current ||
      !chartRef.current
    )
      return;

    const straddlePoints = data
      .map((s) => ({
        time: Math.floor(new Date(s.created_at).getTime() / 1000) as UTCTimestamp,
        value: s.straddle_mid,
      }))
      .filter((p, i, arr) => i === 0 || p.time > arr[i - 1].time);

    const spxPoints = data
      .map((s) => ({
        time: Math.floor(new Date(s.created_at).getTime() / 1000) as UTCTimestamp,
        value: s.spx_ref,
      }))
      .filter((p, i, arr) => i === 0 || p.time > arr[i - 1].time);

    straddleSeriesRef.current.setData(straddlePoints);
    spxSeriesRef.current.setData(spxPoints);

    if (downsideLineRef.current) {
      try {
        spxSeriesRef.current.removePriceLine(downsideLineRef.current);
      } catch {}
      downsideLineRef.current = null;
    }
    if (upsideLineRef.current) {
      try {
        spxSeriesRef.current.removePriceLine(upsideLineRef.current);
      } catch {}
      upsideLineRef.current = null;
    }

    const opening = data[0] ?? null;
    if (opening && openingSkew) {
      const T = 1 / 252;
      const spxRef = opening.spx_ref;
      const downsidePts = spxRef * openingSkew.put_iv * Math.sqrt(T);
      const upsidePts = spxRef * openingSkew.call_iv * Math.sqrt(T);
      const downsideLevel = spxRef - downsidePts;
      const upsideLevel = spxRef + upsidePts;

      // Resolve current CSS values for up/down at each data update
      const up = cssVar("--color-up", "#7FC096");
      const down = cssVar("--color-down", "#D0695E");
      const page = cssVar("--color-page", "#0a0a0a");

      try {
        downsideLineRef.current = spxSeriesRef.current.createPriceLine({
          price: downsideLevel,
          color: `${down}66`,
          lineWidth: 1,
          lineStyle: 2,
          axisLabelVisible: true,
          axisLabelColor: down,
          axisLabelTextColor: page,
          title: `↓${downsidePts.toFixed(0)}`,
        });
      } catch {}

      try {
        upsideLineRef.current = spxSeriesRef.current.createPriceLine({
          price: upsideLevel,
          color: `${up}66`,
          lineWidth: 1,
          lineStyle: 2,
          axisLabelVisible: true,
          axisLabelColor: up,
          axisLabelTextColor: page,
          title: `↑${upsidePts.toFixed(0)}`,
        });
      } catch {}
    }

    try {
      chartRef.current.timeScale().fitContent();
    } catch {}
  }, [data, openingSkew]);

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
        <span className="font-sans text-xs text-text-4 uppercase tracking-wide">
          IV vs RV
        </span>
        <div className="flex gap-3 text-xs">
          <span className="flex items-center gap-1">
            <span className="inline-block w-2.5 h-0.5 bg-skew-moving" />
            <span className="text-text-3">Straddle</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-2.5 h-0.5 bg-text-3" />
            <span className="text-text-3">SPX</span>
          </span>
        </div>
      </div>
      <div ref={containerRef} className="w-full rounded overflow-hidden" />
    </div>
  );
}
