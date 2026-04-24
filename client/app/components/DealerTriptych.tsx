"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef, useState, useMemo } from "react";
import * as echarts from "echarts";
import { supabase } from "../lib/supabase";
import { resolveChartPalette } from "../lib/chartPalette";
import { DealerStrikeSnapshot, DealerStrikeRow } from "../types";

type GexSeriesBar = { bar_time: string; total: number; spot_ref: number };
type TimelineDate = {
  date: string;
  regime_open: string | null;
  open_gex: number | null;
  close_gex: number | null;
};
type TimelineBar = { ts: string; gex: number };

type Props = {
  initialGex: DealerStrikeSnapshot | null;
  initialCex: DealerStrikeSnapshot | null;
  initialGexSeries: GexSeriesBar[];
  initialStraddle: number | null;
  initialSpotRef: number | null;
  timelineDates: TimelineDate[];
  today: string;
  liveSpx: number | null;
};

function fmtGex(v: number): string {
  const abs = Math.abs(v);
  const sign = v >= 0 ? "+" : "-";
  if (abs >= 1e9) return `${sign}${(abs / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `${sign}${(abs / 1e6).toFixed(0)}M`;
  return `${sign}${abs.toFixed(0)}`;
}

function computeCumulative(
  strikes: DealerStrikeRow[] | null,
  spot: number | null,
  rangePt: number,
): { points: { strike: number; cum: number }[]; flipLevel: number | null } {
  if (!strikes || !spot || strikes.length === 0)
    return { points: [], flipLevel: null };

  const filtered = strikes
    .filter((r) => Math.abs(r[0] - spot) <= rangePt)
    .sort((a, b) => a[0] - b[0]);

  let cum = 0;
  const points: { strike: number; cum: number }[] = [];
  const crossings: number[] = [];

  for (let i = 0; i < filtered.length; i++) {
    const prev = cum;
    cum += filtered[i][1];
    points.push({ strike: filtered[i][0], cum });

    if (i > 0 && prev !== 0 && Math.sign(prev) !== Math.sign(cum)) {
      const t = Math.abs(prev) / (Math.abs(prev) + Math.abs(cum));
      const raw =
        filtered[i - 1][0] + (filtered[i][0] - filtered[i - 1][0]) * t;
      crossings.push(Math.round(raw / 5) * 5);
    }
  }

  const flipLevel =
    crossings.length === 0
      ? null
      : crossings.reduce((best, c) =>
          Math.abs(c - spot) < Math.abs(best - spot) ? c : best,
        );

  return { points, flipLevel };
}

function nearestStrikeLabel(
  points: { strike: number; cum: number }[],
  spot: number,
): string {
  if (!points.length) return "";
  return String(
    points.reduce((best, p) =>
      Math.abs(p.strike - spot) < Math.abs(best.strike - spot) ? p : best,
    ).strike,
  );
}

export default function DealerTriptych({
  initialGex,
  initialCex,
  initialGexSeries,
  initialStraddle,
  initialSpotRef,
  timelineDates,
  today,
  liveSpx,
}: Props) {
  const [gexSnapshot, setGexSnapshot] = useState<DealerStrikeSnapshot | null>(
    initialGex,
  );
  const [cexSnapshot, setCexSnapshot] = useState<DealerStrikeSnapshot | null>(
    initialCex,
  );
  const [gexSeries, setGexSeries] = useState<GexSeriesBar[]>(initialGexSeries);
  const [straddle, setStraddle] = useState<number | null>(initialStraddle);
  const [selectedDate, setSelectedDate] = useState<string>(today);
  const [timelineDataForDate, setTimelineDataForDate] = useState<
    TimelineBar[] | null
  >(null);

  // Snapshot-pinned spot — drives curve computation, only changes every 5 min
  const snapshotSpot = gexSnapshot?.spot_ref ?? initialSpotRef ?? null;

  // Display spot — follows live ticks, drives the visual spot marker
  const displaySpot = liveSpx ?? snapshotSpot;

  const rangePt = useMemo(
    () => (straddle ? Math.max(Math.round((2.5 * straddle) / 5) * 5, 50) : 100),
    [straddle],
  );

  const { points: gexCumPoints, flipLevel: gammaFlip } = useMemo(
    () =>
      computeCumulative(gexSnapshot?.strikes ?? null, snapshotSpot, rangePt),
    [gexSnapshot, snapshotSpot, rangePt],
  );

  const { points: cexCumPoints, flipLevel: charmFlip } = useMemo(
    () =>
      computeCumulative(cexSnapshot?.strikes ?? null, snapshotSpot, rangePt),
    [cexSnapshot, snapshotSpot, rangePt],
  );

  // Realtime: dealer snapshots
  useEffect(() => {
    const channel = supabase
      .channel("triptych_dealer")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "dealer_strike_snapshots",
        },
        (payload) => {
          const row = payload.new as any;
          if (row.date !== today) return;
          if (row.metric === "gex") {
            setGexSnapshot(row as DealerStrikeSnapshot);
            setGexSeries((prev) => [
              ...prev,
              {
                bar_time: row.bar_time,
                total: row.total,
                spot_ref: row.spot_ref,
              },
            ]);
          }
          if (row.metric === "cex") {
            setCexSnapshot(row as DealerStrikeSnapshot);
          }
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [today]);

  // Realtime: straddle (for dynamic range)
  useEffect(() => {
    const channel = supabase
      .channel("triptych_straddle")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "straddle_snapshots" },
        (payload) => {
          const row = payload.new as any;
          const date = new Date(row.created_at).toLocaleDateString("en-CA", {
            timeZone: "America/New_York",
          });
          if (date === today && row.straddle_mid > 0) {
            setStraddle(row.straddle_mid);
          }
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [today]);

  // Fetch past timeline data
  useEffect(() => {
    if (selectedDate === today) {
      queueMicrotask(() => setTimelineDataForDate(null));
      return;
    }
    supabase
      .from("dealer_timeline_snapshots")
      .select("data")
      .eq("date", selectedDate)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.data) setTimelineDataForDate(data.data as TimelineBar[]);
      });
  }, [selectedDate, today]);

  const timelineContainerRef = useRef<HTMLDivElement>(null);
  const timelineChartRef = useRef<any>(null);
  const cumGexContainerRef = useRef<HTMLDivElement>(null);
  const cumGexChartRef = useRef<any>(null);
  const cumCexContainerRef = useRef<HTMLDivElement>(null);
  const cumCexChartRef = useRef<any>(null);

  // Init charts
  useEffect(() => {
    if (
      !timelineContainerRef.current ||
      !cumGexContainerRef.current ||
      !cumCexContainerRef.current
    )
      return;

    const P = resolveChartPalette();
    const baseTooltip = {
      backgroundColor: P.bg,
      borderColor: P.border2,
      textStyle: { color: P.text2, fontFamily: "monospace", fontSize: 11 },
    };

    timelineChartRef.current = echarts.init(
      timelineContainerRef.current,
      null,
      { renderer: "canvas" },
    );
    timelineChartRef.current.setOption({
      backgroundColor: P.bg,
      animation: false,
      grid: { top: 10, right: 10, bottom: 28, left: 52 },
      tooltip: {
        ...baseTooltip,
        trigger: "axis",
        formatter: (params: any[]) => {
          if (!params?.length) return "";
          const v = params[0].value as number;
          return `<span style="color:${P.text4};font-size:10px">${params[0].name} ET</span><br/>GEX <span style="color:${v >= 0 ? P.up : P.down}">${fmtGex(v)}</span>`;
        },
      },
      xAxis: {
        type: "category",
        data: [],
        axisLabel: { color: P.text5, fontSize: 9 },
        axisLine: { lineStyle: { color: P.border } },
        axisTick: { show: false },
      },
      yAxis: {
        type: "value",
        axisLabel: {
          color: P.text5,
          fontSize: 9,
          formatter: (v: number) => fmtGex(v),
        },
        axisLine: { lineStyle: { color: P.border } },
        splitLine: { lineStyle: { color: P.border, opacity: 0.5 } },
        scale: true,
      },
      series: [
        {
          type: "bar",
          data: [],
          barMaxWidth: 10,
          markLine: {
            silent: true,
            symbol: "none",
            data: [
              {
                yAxis: 0,
                lineStyle: { color: P.text5, type: "dashed", width: 1 },
                label: { show: false },
              },
            ],
          },
        },
      ],
    });

    cumGexChartRef.current = echarts.init(cumGexContainerRef.current, null, {
      renderer: "canvas",
    });
    cumGexChartRef.current.setOption({
      backgroundColor: P.bg,
      animation: false,
      grid: { top: 10, right: 10, bottom: 28, left: 52 },
      tooltip: {
        ...baseTooltip,
        trigger: "axis",
        formatter: (params: any[]) => {
          if (!params?.length) return "";
          const v = params[0].value as number;
          return `<span style="color:${P.text4};font-size:10px">Strike ${params[0].name}</span><br/>Cumul GEX <span style="color:${P.up}">${fmtGex(v)}</span>`;
        },
      },
      xAxis: {
        type: "category",
        data: [],
        axisLabel: { color: P.text5, fontSize: 9 },
        axisLine: { lineStyle: { color: P.border } },
        axisTick: { show: false },
      },
      yAxis: {
        type: "value",
        axisLabel: {
          color: P.text5,
          fontSize: 9,
          formatter: (v: number) => fmtGex(v),
        },
        axisLine: { lineStyle: { color: P.border } },
        splitLine: { lineStyle: { color: P.border, opacity: 0.5 } },
        scale: true,
      },
      series: [
        {
          type: "line",
          data: [],
          symbol: "none",
          lineStyle: { color: P.up, width: 1.5 },
          markLine: { silent: true, symbol: "none", data: [] },
        },
      ],
    });

    cumCexChartRef.current = echarts.init(cumCexContainerRef.current, null, {
      renderer: "canvas",
    });
    cumCexChartRef.current.setOption({
      backgroundColor: P.bg,
      animation: false,
      grid: { top: 10, right: 10, bottom: 28, left: 52 },
      tooltip: {
        ...baseTooltip,
        trigger: "axis",
        formatter: (params: any[]) => {
          if (!params?.length) return "";
          const v = params[0].value as number;
          return `<span style="color:${P.text4};font-size:10px">Strike ${params[0].name}</span><br/>Cumul CEX <span style="color:#E5A04A">${fmtGex(v)}</span>`;
        },
      },
      xAxis: {
        type: "category",
        data: [],
        axisLabel: { color: P.text5, fontSize: 9 },
        axisLine: { lineStyle: { color: P.border } },
        axisTick: { show: false },
      },
      yAxis: {
        type: "value",
        axisLabel: {
          color: P.text5,
          fontSize: 9,
          formatter: (v: number) => fmtGex(v),
        },
        axisLine: { lineStyle: { color: P.border } },
        splitLine: { lineStyle: { color: P.border, opacity: 0.5 } },
        scale: true,
      },
      series: [
        {
          type: "line",
          data: [],
          symbol: "none",
          lineStyle: { color: "#E5A04A", width: 1.5 },
          markLine: { silent: true, symbol: "none", data: [] },
        },
      ],
    });

    const observer = new ResizeObserver(() => {
      timelineChartRef.current?.resize();
      cumGexChartRef.current?.resize();
      cumCexChartRef.current?.resize();
    });
    [timelineContainerRef, cumGexContainerRef, cumCexContainerRef].forEach(
      (r) => r.current && observer.observe(r.current),
    );

    return () => {
      observer.disconnect();
      timelineChartRef.current?.dispose();
      cumGexChartRef.current?.dispose();
      cumCexChartRef.current?.dispose();
      timelineChartRef.current = null;
      cumGexChartRef.current = null;
      cumCexChartRef.current = null;
    };
  }, []);

  // Update: timeline
  useEffect(() => {
    if (!timelineChartRef.current) return;
    const P = resolveChartPalette();

    let labels: string[] = [];
    let values: number[] = [];

    if (selectedDate === today) {
      labels = gexSeries.map((b) => b.bar_time);
      values = gexSeries.map((b) => b.total);
    } else if (timelineDataForDate) {
      const rthBars = timelineDataForDate.filter(
        (b: TimelineBar) => b.ts >= "09:30" && b.ts <= "16:15",
      );
      labels = rthBars.map((b: TimelineBar) => b.ts);
      values = rthBars.map((b: TimelineBar) => b.gex);
    }

    timelineChartRef.current.setOption(
      {
        xAxis: { data: labels },
        series: [
          {
            data: values.map((v) => ({
              value: v,
              itemStyle: { color: v >= 0 ? P.up + "cc" : P.down + "cc" },
            })),
          },
        ],
      },
      false,
    );
  }, [gexSeries, timelineDataForDate, selectedDate, today]);

  // Update: cumulative GEX
  useEffect(() => {
    if (!cumGexChartRef.current || gexCumPoints.length === 0 || !displaySpot)
      return;
    const P = resolveChartPalette();

    const labels = gexCumPoints.map((p) => String(p.strike));
    const values = gexCumPoints.map((p) => p.cum);
    const spotLabel = nearestStrikeLabel(gexCumPoints, displaySpot);

    const markLineData: any[] = [
      {
        yAxis: 0,
        lineStyle: { color: P.text5, type: "dashed", width: 1 },
        label: { show: false },
      },
      {
        xAxis: spotLabel,
        lineStyle: { color: P.text2, type: "dashed", width: 1 },
        label: { show: false },
      },
    ];

    cumGexChartRef.current.setOption(
      {
        xAxis: {
          data: labels,
          axisLabel: {
            color: P.text5,
            fontSize: 9,
            formatter: (value: string) => {
              return value === spotLabel ? `{hl|${value}}` : value;
            },
            rich: {
              hl: {
                color: P.bg,
                backgroundColor: P.text2,
                padding: [2, 4],
                fontSize: 9,
                fontFamily: "monospace",
                borderRadius: 2,
              },
            },
          },
        },
        series: [
          {
            data: values,
            markLine: { silent: true, symbol: "none", data: markLineData },
          },
        ],
      },
      false,
    );
  }, [gexCumPoints, gammaFlip, displaySpot]);

  // Update: cumulative CEX
  useEffect(() => {
    if (!cumCexChartRef.current || cexCumPoints.length === 0 || !displaySpot)
      return;
    const P = resolveChartPalette();

    const labels = cexCumPoints.map((p) => String(p.strike));
    const values = cexCumPoints.map((p) => p.cum);
    const spotLabel = nearestStrikeLabel(cexCumPoints, displaySpot);

    const markLineData: any[] = [
      {
        yAxis: 0,
        lineStyle: { color: P.text5, type: "dashed", width: 1 },
        label: { show: false },
      },
      {
        xAxis: spotLabel,
        lineStyle: { color: P.text2, type: "dashed", width: 1 },
        label: { show: false },
      },
    ];

    cumCexChartRef.current.setOption(
      {
        xAxis: {
          data: labels,
          axisLabel: {
            color: P.text5,
            fontSize: 9,
            formatter: (value: string) => {
              return value === spotLabel ? `{hl|${value}}` : value;
            },
            rich: {
              hl: {
                color: P.bg,
                backgroundColor: P.text2,
                padding: [2, 4],
                fontSize: 9,
                fontFamily: "monospace",
                borderRadius: 2,
              },
            },
          },
        },
        series: [
          {
            data: values,
            markLine: { silent: true, symbol: "none", data: markLineData },
          },
        ],
      },
      false,
    );
  }, [cexCumPoints, charmFlip, displaySpot]);

  const noData = !gexSnapshot && !initialGex;

  if (noData) {
    return (
      <div className="border border-border-2 bg-page flex items-center justify-center h-32 text-xs text-text-5 uppercase tracking-[0.1em]">
        No dealer data yet — waiting for first 09:35 ET cycle
      </div>
    );
  }

  return (
    <div className="grid grid-cols-3 gap-3">
      {/* GEX Intraday */}
      <div className="border border-border-2 bg-page flex flex-col">
        <div
          className="flex items-center justify-between px-3 border-b border-border-2"
          style={{ minHeight: 32 }}
        >
          <span className="font-sans text-xs text-text-4 uppercase tracking-[0.05em]">
            GEX intraday · 0DTE MM
          </span>
          <select
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="bg-panel border border-border text-text-3 font-mono text-[9px] px-1 py-0.5 rounded focus:outline-none"
          >
            <option value={today}>{today} · live</option>
            {timelineDates
              .filter((d) => d.date !== today)
              .map((d) => (
                <option key={d.date} value={d.date}>
                  {d.date}
                  {d.regime_open ? ` · ${d.regime_open}` : ""}
                </option>
              ))}
          </select>
        </div>
        <div
          ref={timelineContainerRef}
          className="w-full"
          style={{ height: 180 }}
        />
      </div>

      {/* Cumulative GEX */}
      <div className="border border-border-2 bg-page flex flex-col">
        <div
          className="flex items-center justify-between px-3 border-b border-border-2"
          style={{ minHeight: 32 }}
        >
          <span className="font-sans text-xs text-text-4 uppercase tracking-[0.05em]">
            Cumulative gex curve
          </span>
        </div>
        <div
          ref={cumGexContainerRef}
          className="w-full"
          style={{ height: 180 }}
        />
      </div>

      {/* Cumulative CEX */}
      <div className="border border-border-2 bg-page flex flex-col">
        <div
          className="flex items-center justify-between px-3 border-b border-border-2"
          style={{ minHeight: 32 }}
        >
          <span className="font-sans text-xs text-text-4 uppercase tracking-[0.05em]">
            Cumulative CEX curve
          </span>
        </div>
        <div
          ref={cumCexContainerRef}
          className="w-full"
          style={{ height: 180 }}
        />
      </div>
    </div>
  );
}
