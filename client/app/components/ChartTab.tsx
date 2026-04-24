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
  initialStraddle: {
    straddle_mid: number;
    spx_ref: number;
    created_at: string;
  } | null;
  timelineDates: TimelineDate[];
  today: string;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

  // Return the crossing closest to spot — not the first one
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

// ─── Component ───────────────────────────────────────────────────────────────

export default function ChartTab({
  initialGex,
  initialCex,
  initialGexSeries,
  initialStraddle,
  timelineDates,
  today,
}: Props) {
  const [gexSnapshot, setGexSnapshot] = useState<DealerStrikeSnapshot | null>(
    initialGex,
  );
  const [cexSnapshot, setCexSnapshot] = useState<DealerStrikeSnapshot | null>(
    initialCex,
  );
  const [gexSeries, setGexSeries] = useState<GexSeriesBar[]>(initialGexSeries);
  const [straddle, setStraddle] = useState<number | null>(
    initialStraddle?.straddle_mid ?? null,
  );
  const [selectedDate, setSelectedDate] = useState<string>(today);
  const [timelineDataForDate, setTimelineDataForDate] = useState<
    TimelineBar[] | null
  >(null);

  // ── Derived ────────────────────────────────────────────────────────────────

  const spot = gexSnapshot?.spot_ref ?? initialStraddle?.spx_ref ?? null;

  const rangePt = useMemo(
    () => (straddle ? Math.max(Math.round((2.5 * straddle) / 5) * 5, 50) : 100),
    [straddle],
  );

  const { points: gexCumPoints, flipLevel: gammaFlip } = useMemo(
    () => computeCumulative(gexSnapshot?.strikes ?? null, spot, rangePt),
    [gexSnapshot, spot, rangePt],
  );

  const { points: cexCumPoints, flipLevel: charmFlip } = useMemo(
    () => computeCumulative(cexSnapshot?.strikes ?? null, spot, rangePt),
    [cexSnapshot, spot, rangePt],
  );

  const profileStrikes = useMemo(
    () =>
      spot && gexSnapshot?.strikes
        ? gexSnapshot.strikes
            .filter((r) => Math.abs(r[0] - spot) <= rangePt)
            .sort((a, b) => a[0] - b[0])
        : [],
    [gexSnapshot, spot, rangePt],
  );

  // ── Realtime: dealer snapshots ─────────────────────────────────────────────

  useEffect(() => {
    const channel = supabase
      .channel("chart_dealer")
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

  // ── Realtime: straddle (for dynamic range) ─────────────────────────────────

  useEffect(() => {
    const channel = supabase
      .channel("chart_straddle")
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

  // ── Fetch past timeline data ───────────────────────────────────────────────

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

  // ── Chart refs ─────────────────────────────────────────────────────────────

  const profileContainerRef = useRef<HTMLDivElement>(null);
  const profileChartRef = useRef<any>(null);
  const timelineContainerRef = useRef<HTMLDivElement>(null);
  const timelineChartRef = useRef<any>(null);
  const cumGexContainerRef = useRef<HTMLDivElement>(null);
  const cumGexChartRef = useRef<any>(null);
  const cumCexContainerRef = useRef<HTMLDivElement>(null);
  const cumCexChartRef = useRef<any>(null);

  // ── Init charts ────────────────────────────────────────────────────────────

  useEffect(() => {
    if (
      !profileContainerRef.current ||
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

    profileChartRef.current = echarts.init(profileContainerRef.current, null, {
      renderer: "canvas",
    });
    profileChartRef.current.setOption({
      backgroundColor: P.bg,
      animation: false,
      grid: { top: 8, right: 72, bottom: 20, left: 52 },
      tooltip: {
        ...baseTooltip,
        trigger: "item",
        formatter: (params: any) => {
          const v = params.value as number;
          return `<span style="color:${P.text4};font-size:10px">Strike ${params.name}</span><br/>GEX <span style="color:${v >= 0 ? P.up : P.down}">${fmtGex(v)}</span>`;
        },
      },
      xAxis: {
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
      yAxis: {
        type: "category",
        data: [],
        axisLabel: { color: P.text5, fontSize: 9 },
        axisLine: { lineStyle: { color: P.border } },
        axisTick: { show: false },
      },
      series: [
        {
          type: "bar",
          data: [],
          barMaxWidth: 14,
          markLine: { silent: true, symbol: "none", data: [] },
        },
      ],
    });

    timelineChartRef.current = echarts.init(
      timelineContainerRef.current,
      null,
      { renderer: "canvas" },
    );
    timelineChartRef.current.setOption({
      backgroundColor: P.bg,
      animation: false,
      grid: { top: 12, right: 16, bottom: 36, left: 64 },
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
          barMaxWidth: 12,
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
      grid: { top: 8, right: 16, bottom: 24, left: 64 },
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
      grid: { top: 8, right: 16, bottom: 24, left: 64 },
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
      profileChartRef.current?.resize();
      timelineChartRef.current?.resize();
      cumGexChartRef.current?.resize();
      cumCexChartRef.current?.resize();
    });
    [
      profileContainerRef,
      timelineContainerRef,
      cumGexContainerRef,
      cumCexContainerRef,
    ].forEach((r) => r.current && observer.observe(r.current));

    return () => {
      observer.disconnect();
      profileChartRef.current?.dispose();
      timelineChartRef.current?.dispose();
      cumGexChartRef.current?.dispose();
      cumCexChartRef.current?.dispose();
      profileChartRef.current = null;
      timelineChartRef.current = null;
      cumGexChartRef.current = null;
      cumCexChartRef.current = null;
    };
  }, []);

  // ── Update: GEX profile ────────────────────────────────────────────────────

  useEffect(() => {
    if (!profileChartRef.current || !spot || profileStrikes.length === 0)
      return;
    const P = resolveChartPalette();

    // Build strike → CEX value map for tooltip enrichment
    const cexMap = new Map<number, number>();
    if (cexSnapshot?.strikes) {
      for (const r of cexSnapshot.strikes) {
        cexMap.set(r[0], r[1]);
      }
    }

    const strikeLabels = profileStrikes.map((r) => String(r[0]));
    const nearestToSpot = profileStrikes.reduce((best, r) =>
      Math.abs(r[0] - spot) < Math.abs(best[0] - spot) ? r : best,
    )[0];

    const markLineData: any[] = [
      {
        yAxis: String(nearestToSpot),
        lineStyle: { color: P.text3, type: "dashed", width: 1 },
        label: {
          show: true,
          position: "insideEndTop",
          formatter: `${spot.toFixed(0)}`,
          color: P.text3,
          fontSize: 9,
          fontFamily: "monospace",
        },
      },
    ];
    if (gammaFlip !== null) {
      markLineData.push({
        yAxis: String(gammaFlip),
        lineStyle: { color: P.up, type: "solid", width: 1.5 },
        label: {
          show: true,
          position: "insideEndBottom",
          formatter: `γ ${gammaFlip}`,
          color: P.up,
          fontSize: 9,
          fontFamily: "monospace",
        },
      });
    }

    profileChartRef.current.setOption(
      {
        tooltip: {
          trigger: "item",
          backgroundColor: P.bg,
          borderColor: P.border2,
          textStyle: { color: P.text2, fontFamily: "monospace", fontSize: 11 },
          formatter: (params: any) => {
            const strike = parseInt(params.name, 10);
            const gexVal = params.value as number;
            const cexVal = cexMap.get(strike) ?? null;
            const callGex =
              profileStrikes.find((r) => r[0] === strike)?.[2] ?? null;
            const putGex =
              profileStrikes.find((r) => r[0] === strike)?.[3] ?? null;

            let html = `<span style="color:${P.text4};font-size:10px">Strike ${strike}</span><br/>`;
            html += `GEX <span style="color:${gexVal >= 0 ? P.up : P.down}">${fmtGex(gexVal)}</span>`;
            if (callGex !== null && putGex !== null) {
              html += `<br/><span style="color:${P.text5};font-size:9px">call ${fmtGex(callGex)} · put ${fmtGex(putGex)}</span>`;
            }
            if (cexVal !== null) {
              html += `<br/>CEX <span style="color:${cexVal >= 0 ? "#4A9EFF" : "#E5A04A"}">${fmtGex(cexVal)}</span>`;
              html += `<span style="color:${P.text5};font-size:9px"> ${cexVal >= 0 ? "bearish charm" : "bullish charm"}</span>`;
            }
            return html;
          },
        },
        yAxis: { data: strikeLabels },
        series: [
          {
            data: profileStrikes.map((r) => ({
              value: r[1],
              itemStyle: {
                color:
                  r[1] >= 0
                    ? r[0] === nearestToSpot
                      ? P.up
                      : P.up + "88"
                    : r[0] === nearestToSpot
                      ? P.down
                      : P.down + "88",
              },
            })),
            markLine: { silent: true, symbol: "none", data: markLineData },
          },
        ],
      },
      false,
    );
  }, [profileStrikes, spot, gammaFlip, cexSnapshot]);

  // ── Update: timeline ───────────────────────────────────────────────────────

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

  // ── Update: cumulative GEX ─────────────────────────────────────────────────

  useEffect(() => {
    if (!cumGexChartRef.current || gexCumPoints.length === 0 || !spot) return;
    const P = resolveChartPalette();

    const labels = gexCumPoints.map((p) => String(p.strike));
    const values = gexCumPoints.map((p) => p.cum);
    const spotLabel = nearestStrikeLabel(gexCumPoints, spot);

    const markLineData: any[] = [
      {
        yAxis: 0,
        lineStyle: { color: P.text5, type: "dashed", width: 1 },
        label: { show: false },
      },
      {
        xAxis: spotLabel,
        lineStyle: { color: P.text3, type: "dashed", width: 1 },
        label: {
          show: true,
          formatter: "spot",
          color: P.text3,
          fontSize: 9,
          fontFamily: "monospace",
        },
      },
    ];
    if (gammaFlip !== null) {
      markLineData.push({
        xAxis: String(gammaFlip),
        lineStyle: { color: P.up, type: "solid", width: 1.5 },
        label: {
          show: true,
          formatter: `γ flip ${gammaFlip}`,
          color: P.up,
          fontSize: 9,
          fontFamily: "monospace",
        },
      });
    }

    cumGexChartRef.current.setOption(
      {
        xAxis: { data: labels },
        series: [
          {
            data: values,
            markLine: { silent: true, symbol: "none", data: markLineData },
          },
        ],
      },
      false,
    );
  }, [gexCumPoints, gammaFlip, spot]);

  // ── Update: cumulative CEX ─────────────────────────────────────────────────

  useEffect(() => {
    if (!cumCexChartRef.current || cexCumPoints.length === 0 || !spot) return;
    const P = resolveChartPalette();

    const labels = cexCumPoints.map((p) => String(p.strike));
    const values = cexCumPoints.map((p) => p.cum);
    const spotLabel = nearestStrikeLabel(cexCumPoints, spot);

    const markLineData: any[] = [
      {
        yAxis: 0,
        lineStyle: { color: P.text5, type: "dashed", width: 1 },
        label: { show: false },
      },
      {
        xAxis: spotLabel,
        lineStyle: { color: P.text3, type: "dashed", width: 1 },
        label: {
          show: true,
          formatter: "spot",
          color: P.text3,
          fontSize: 9,
          fontFamily: "monospace",
        },
      },
    ];
    if (charmFlip !== null) {
      markLineData.push({
        xAxis: String(charmFlip),
        lineStyle: { color: "#E5A04A", type: "solid", width: 1.5 },
        label: {
          show: true,
          formatter: `⌀ flip ${charmFlip}`,
          color: "#E5A04A",
          fontSize: 9,
          fontFamily: "monospace",
        },
      });
    }

    cumCexChartRef.current.setOption(
      {
        xAxis: { data: labels },
        series: [
          {
            data: values,
            markLine: { silent: true, symbol: "none", data: markLineData },
          },
        ],
      },
      false,
    );
  }, [cexCumPoints, charmFlip, spot]);

  // ── Render ─────────────────────────────────────────────────────────────────

  const barTime = gexSnapshot?.bar_time ?? null;
  const noData = !gexSnapshot && !initialGex;

  return (
    <div className="max-w-7xl mx-auto px-4 md:px-6 py-3 space-y-3">
      <div className="border border-border-2 bg-panel px-3 py-2 flex flex-wrap items-center gap-4 font-mono text-[11px]">
        {spot !== null && (
          <>
            <span className="text-text-4">SPX</span>
            <span className="text-text-2">{spot.toFixed(2)}</span>
            <div className="w-px h-4 bg-border-2" />
          </>
        )}
        {gammaFlip !== null && spot !== null && (
          <>
            <span className="text-text-4">γ FLIP</span>
            <span style={{ color: "var(--color-up)" }}>
              {gammaFlip}
              <span className="text-text-5 font-sans text-[9px] ml-1">
                {gammaFlip > spot ? "+" : ""}
                {(gammaFlip - spot).toFixed(0)}pt
              </span>
            </span>
            <div className="w-px h-4 bg-border-2" />
          </>
        )}
        {charmFlip !== null && spot !== null && (
          <>
            <span className="text-text-4">⌀ FLIP</span>
            <span style={{ color: "#E5A04A" }}>
              {charmFlip}
              <span className="text-text-5 font-sans text-[9px] ml-1">
                {charmFlip > spot ? "+" : ""}
                {(charmFlip - spot).toFixed(0)}pt
              </span>
            </span>
            <div className="w-px h-4 bg-border-2" />
          </>
        )}
        {straddle !== null && (
          <>
            <span className="text-text-4">RANGE</span>
            <span className="text-text-2">
              ±{rangePt}pt
              <span className="text-text-5 font-sans text-[9px] ml-1">
                2.5× ${straddle.toFixed(2)}
              </span>
            </span>
          </>
        )}
        {barTime && (
          <span className="ml-auto text-text-5 font-sans text-[10px]">
            updated {barTime} ET
          </span>
        )}
      </div>

      {noData ? (
        <div className="flex items-center justify-center h-64 text-xs text-text-5 uppercase tracking-[0.1em]">
          No dealer data yet — waiting for first 09:35 ET cycle
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* GEX Profile */}
          <div className="border border-border-2 bg-page">
            <div className="flex items-center justify-between px-3 py-1.5 border-b border-border-2">
              <span className="font-sans text-xs text-text-4 uppercase tracking-[0.05em]">
                GEX strike profile
              </span>
              <div className="flex items-center gap-2">
                {gammaFlip !== null && (
                  <span
                    className="font-mono text-[10px] px-1.5 py-px border"
                    style={{
                      color: "var(--color-up)",
                      borderColor: "var(--color-up)",
                    }}
                  >
                    γ flip {gammaFlip}
                  </span>
                )}
                {barTime && (
                  <span className="font-mono text-[9px] text-text-5">
                    {barTime} ET
                  </span>
                )}
              </div>
            </div>
            <div
              ref={profileContainerRef}
              className="w-full"
              style={{ height: 360 }}
            />
            <div className="flex gap-4 px-3 py-1.5 border-t border-border-2">
              <div className="flex items-center gap-1.5 font-sans text-[9px] text-text-5">
                <div
                  className="w-2 h-2 rounded-sm"
                  style={{ background: "var(--color-up)" }}
                />
                long gamma
              </div>
              <div className="flex items-center gap-1.5 font-sans text-[9px] text-text-5">
                <div
                  className="w-2 h-2 rounded-sm"
                  style={{ background: "var(--color-down)" }}
                />
                short gamma
              </div>
            </div>
          </div>

          {/* GEX Timeline */}
          <div className="border border-border-2 bg-page">
            <div className="flex items-center justify-between px-3 py-1.5 border-b border-border-2">
              <span className="font-sans text-xs text-text-4 uppercase tracking-[0.05em]">
                GEX intraday · 0DTE MM
              </span>
              <select
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="bg-panel border border-border text-text-3 font-mono text-[10px] px-1.5 py-0.5 rounded focus:outline-none"
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
              style={{ height: 360 }}
            />
            <div className="flex gap-4 px-3 py-1.5 border-t border-border-2">
              <div className="flex items-center gap-1.5 font-sans text-[9px] text-text-5">
                <div
                  className="w-5 h-px"
                  style={{ background: "var(--color-up)" }}
                />
                pos gamma
              </div>
              <div className="flex items-center gap-1.5 font-sans text-[9px] text-text-5">
                <div
                  className="w-5 h-px"
                  style={{ background: "var(--color-down)" }}
                />
                neg gamma
              </div>
            </div>
          </div>

          {/* Cumulative GEX */}
          <div className="border border-border-2 bg-page">
            <div className="flex items-center justify-between px-3 py-1.5 border-b border-border-2">
              <span className="font-sans text-xs text-text-4 uppercase tracking-[0.05em]">
                Cumulative GEX — gamma flip
              </span>
              {gammaFlip !== null && (
                <span
                  className="font-mono text-[10px] px-1.5 py-px border"
                  style={{
                    color: "var(--color-up)",
                    borderColor: "var(--color-up)",
                  }}
                >
                  γ flip {gammaFlip}
                </span>
              )}
            </div>
            <div
              ref={cumGexContainerRef}
              className="w-full"
              style={{ height: 220 }}
            />
          </div>

          {/* Cumulative CEX */}
          <div className="border border-border-2 bg-page">
            <div className="flex items-center justify-between px-3 py-1.5 border-b border-border-2">
              <span className="font-sans text-xs text-text-4 uppercase tracking-[0.05em]">
                Cumulative CEX — charm flip
              </span>
              {charmFlip !== null && (
                <span
                  className="font-mono text-[10px] px-1.5 py-px border"
                  style={{ color: "#E5A04A", borderColor: "#E5A04A" }}
                >
                  ⌀ flip {charmFlip}
                </span>
              )}
            </div>
            <div
              ref={cumCexContainerRef}
              className="w-full"
              style={{ height: 220 }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
