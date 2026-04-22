"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef } from "react";
import * as echarts from "echarts";
import { StraddleSnapshot, SkewSnapshot, DealerStrikeSnapshot } from "../types";
import { resolveChartPalette } from "../lib/chartPalette";
import { cssVar } from "../lib/theme";

type Props = {
  data: StraddleSnapshot[];
  currentSpxPrice: number | null;
  openingSkew: SkewSnapshot | null;
  dealerGex: DealerStrikeSnapshot | null;
};

function fmtGexShort(v: number): string {
  const abs = Math.abs(v);
  const sign = v >= 0 ? "+" : "-";
  if (abs >= 1e9) return `${sign}${(abs / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `${sign}${(abs / 1e6).toFixed(0)}M`;
  return `${sign}${abs.toFixed(0)}`;
}

function toChartMs(utcMs: number): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(new Date(utcMs));
  const p = Object.fromEntries(parts.map((x) => [x.type, x.value]));
  const hour = p.hour === "24" ? "00" : p.hour;
  return Date.UTC(
    Number(p.year),
    Number(p.month) - 1,
    Number(p.day),
    Number(hour),
    Number(p.minute),
    Number(p.second),
  );
}

function formatCT(shiftedMs: number): string {
  const d = new Date(shiftedMs);
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function formatET(utcMs: number): string {
  return new Date(utcMs).toLocaleTimeString("en-GB", {
    timeZone: "America/New_York",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function formatLocal(utcMs: number): string {
  return new Date(utcMs).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function isRTH(): boolean {
  const now = new Date();
  const day = now.toLocaleDateString("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
  });
  const time = now.toLocaleTimeString("en-US", {
    timeZone: "America/New_York",
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  if (["Sat", "Sun"].includes(day)) return false;
  return time >= "09:30:00" && time < "16:00:00";
}

export default function StraddleSpxChart({
  data,
  currentSpxPrice,
  openingSkew,
  dealerGex,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any>(null);
  const utcLookupRef = useRef<Map<number, number>>(new Map());

  useEffect(() => {
    if (!containerRef.current) return;
    const P = resolveChartPalette();
    const skewMoving = cssVar("--color-skew-moving", "#9B7BB3");

    const chart = echarts.init(containerRef.current, null, {
      renderer: "canvas",
    });
    chartRef.current = chart;

    chart.setOption({
      backgroundColor: P.bg,
      animation: false,
      useUTC: true,
      grid: { top: 8, right: 64, bottom: 24, left: 64 },
      tooltip: {
        trigger: "axis",
        backgroundColor: P.bg,
        borderColor: P.border2,
        textStyle: { color: P.text2, fontFamily: "monospace", fontSize: 11 },
        axisPointer: {
          type: "cross",
          crossStyle: { color: P.text6, width: 1 },
        },
        formatter: (params: any[]) => {
          if (!params?.length) return "";
          const shiftedMs = params[0].value[0];
          const utcMs = utcLookupRef.current.get(shiftedMs) ?? shiftedMs;
          const lines = params
            .filter((p: any) => p.seriesName && p.value[1] !== null)
            .map((p: any) => {
              const v =
                typeof p.value[1] === "number" ? p.value[1].toFixed(2) : "—";
              return `<span style="color:${p.color}">●</span> ${p.seriesName}: ${v}`;
            });
          return (
            `${lines.join("<br/>")}<br/>` +
            `<span style="color:${P.text5};font-size:10px">` +
            `${formatCT(shiftedMs)} CT · ${formatET(utcMs)} ET · ${formatLocal(utcMs)} local` +
            `</span>`
          );
        },
      },
      xAxis: {
        type: "time",
        axisLine: { lineStyle: { color: P.border } },
        axisLabel: {
          color: P.text5,
          fontSize: 10,
          formatter: (value: number) => formatCT(value),
        },
        splitLine: { lineStyle: { color: P.border, opacity: 0.5 } },
      },
      yAxis: [
        {
          type: "value",
          position: "left",
          axisLine: { lineStyle: { color: P.border } },
          axisLabel: { color: P.text5, fontSize: 10 },
          splitLine: { lineStyle: { color: P.border, opacity: 0.5 } },
          scale: true,
        },
        {
          type: "value",
          position: "right",
          axisLine: { lineStyle: { color: P.border } },
          axisLabel: {
            color: P.text5,
            fontSize: 10,
            formatter: (v: number) => `$${v.toFixed(0)}`,
          },
          splitLine: { show: false },
          scale: true,
        },
      ],
      series: [
        {
          name: "SPX",
          type: "line",
          yAxisIndex: 0,
          data: [],
          lineStyle: { color: P.text3, width: 1, type: "dashed" },
          itemStyle: { color: P.text3 },
          symbol: "none",
          connectNulls: false,
          markLine: { silent: true, symbol: "none", data: [] },
        },
        {
          name: "Straddle",
          type: "line",
          yAxisIndex: 1,
          data: [],
          lineStyle: { color: skewMoving, width: 1 },
          itemStyle: { color: skewMoving },
          areaStyle: { color: `${skewMoving}22` },
          symbol: "none",
          connectNulls: false,
          endLabel: {
            show: true,
            formatter: (params: any) =>
              typeof params.value[1] === "number"
                ? `$${params.value[1].toFixed(2)}`
                : "",
            backgroundColor: skewMoving,
            color: P.bg,
            padding: [2, 4],
            borderRadius: 2,
            fontSize: 10,
            fontFamily: "monospace",
            fontWeight: 500,
          },
        },
      ],
    });

    const observer = new ResizeObserver(() => chart.resize());
    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
      chart.dispose();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!chartRef.current || !data.length) return;
    const P = resolveChartPalette();

    utcLookupRef.current.clear();

    const seen = new Set<number>();
    const deduped = data.filter((s) => {
      const t = new Date(s.created_at).getTime();
      if (seen.has(t)) return false;
      seen.add(t);
      return true;
    });

    const spxPoints: [number, number][] = deduped.map((s) => {
      const utcMs = new Date(s.created_at).getTime();
      const shifted = toChartMs(utcMs);
      utcLookupRef.current.set(shifted, utcMs);
      return [shifted, s.spx_ref];
    });
    const straddlePoints: [number, number][] = deduped.map((s) => {
      const utcMs = new Date(s.created_at).getTime();
      const shifted = toChartMs(utcMs);
      utcLookupRef.current.set(shifted, utcMs);
      return [shifted, s.straddle_mid];
    });

    if (currentSpxPrice && isRTH()) {
      const nowUtc = Math.floor(Date.now() / 60000) * 60000;
      const shifted = toChartMs(nowUtc);
      utcLookupRef.current.set(shifted, nowUtc);
      spxPoints.push([shifted, currentSpxPrice]);
    }

    const markLines: any[] = [];

    // Current SPX value — pill on left axis
    const latestSpxPoint = spxPoints[spxPoints.length - 1];
    if (latestSpxPoint && latestSpxPoint[1] !== null) {
      const currentSpx = latestSpxPoint[1] as number;
      markLines.push({
        yAxis: currentSpx,
        lineStyle: { color: "transparent", width: 1 },
        symbol: ["none", "none"],
        label: {
          show: true,
          position: "start",
          distance: 0,
          formatter: currentSpx.toFixed(2),
          backgroundColor: P.text3,
          color: P.bg,
          padding: [2, 4],
          borderRadius: 2,
          fontSize: 10,
          fontFamily: "monospace",
          fontWeight: 500,
        },
      });
    }

    const opening = deduped[0] ?? null;
    if (opening && openingSkew) {
      const T = 1 / 252;
      const ref = opening.spx_ref;
      const downsidePts = ref * openingSkew.put_iv * Math.sqrt(T);
      const upsidePts = ref * openingSkew.call_iv * Math.sqrt(T);
      markLines.push({
        yAxis: ref - downsidePts,
        lineStyle: { color: `${P.down}66`, type: "dashed", width: 1 },
        label: {
          show: true,
          position: "insideEndBottom",
          formatter: `↓${downsidePts.toFixed(0)}`,
          color: P.down,
          fontSize: 9,
          fontFamily: "monospace",
        },
      });
      markLines.push({
        yAxis: ref + upsidePts,
        lineStyle: { color: `${P.up}66`, type: "dashed", width: 1 },
        label: {
          show: true,
          position: "insideEndTop",
          formatter: `↑${upsidePts.toFixed(0)}`,
          color: P.up,
          fontSize: 9,
          fontFamily: "monospace",
        },
      });
    }

    if (dealerGex?.top_pos_strike != null && dealerGex?.top_pos_value != null) {
      markLines.push({
        yAxis: dealerGex.top_pos_strike,
        lineStyle: { color: `${P.up}99`, type: "solid", width: 1 },
        label: {
          show: true,
          position: "insideStartTop",
          formatter: `${dealerGex.top_pos_strike}  ${fmtGexShort(dealerGex.top_pos_value)}`,
          color: P.up,
          fontSize: 9,
          fontFamily: "monospace",
        },
      });
    }
    if (dealerGex?.top_neg_strike != null && dealerGex?.top_neg_value != null) {
      markLines.push({
        yAxis: dealerGex.top_neg_strike,
        lineStyle: { color: `${P.down}99`, type: "solid", width: 1 },
        label: {
          show: true,
          position: "insideStartBottom",
          formatter: `${dealerGex.top_neg_strike}  ${fmtGexShort(dealerGex.top_neg_value)}`,
          color: P.down,
          fontSize: 9,
          fontFamily: "monospace",
        },
      });
    }

    chartRef.current.setOption(
      {
        series: [
          {
            name: "SPX",
            data: spxPoints,
            markLine: { silent: true, symbol: "none", data: markLines },
          },
          { name: "Straddle", data: straddlePoints },
        ],
      },
      false,
    );
  }, [data, currentSpxPrice, openingSkew, dealerGex]);

  return (
    <div>
      <div className="flex justify-between items-center mb-1.5">
        <span className="font-sans text-xs text-text-4 uppercase tracking-wide">
          Implied vs Realized Intraday
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
      <div ref={containerRef} className="w-full" style={{ height: 150 }} />
    </div>
  );
}
