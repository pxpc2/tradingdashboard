# Agents — Coding Conventions

Guidelines for writing code that fits the vovonacci dashboard. Read CLAUDE.md first for full project context.

---

## The Golden Rule

**Hooks own data. Components own UI. Never mix.**

- All Supabase calls live in `hooks/` or in Next.js API routes (`api/`)
- View components receive everything as props
- Chart components receive typed data arrays as props — no business logic inside them

**Exception**: `PositionsPanel.tsx` includes an inline SML input form that writes to Supabase.

---

## CRITICAL: Always Ask for Current File First

Pedro frequently makes visual and text tweaks between sessions. **Always request the current file before modifying it.** Never code on top of a file from earlier in the conversation without confirming it's still current.

---

## Hook Structure

```typescript
"use client";
import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";

export function useXxxData(
  selectedDate: string,
  initialData: XxxSnapshot[] = [],
) {
  const [data, setData] = useState<XxxSnapshot[]>(initialData);

  // Effect 1 — fetch on date change
  useEffect(() => {
    let cancelled = false;
    async function load() {
      const { data } = await supabase
        .from("xxx_snapshots")
        .select("*")
        .gte("created_at", `${selectedDate}T00:00:00`)
        .lt("created_at", `${selectedDate}T23:59:59`)
        .order("created_at", { ascending: true });
      if (!cancelled && data) setData(data);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [selectedDate]);

  // Effect 2 — realtime, only appends when viewing today
  useEffect(() => {
    const today = new Date().toLocaleDateString("en-CA", {
      timeZone: "America/New_York",
    });
    const channel = supabase
      .channel("xxx_realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "xxx_snapshots" },
        (payload) => {
          if (selectedDate === today)
            setData((prev) => [...prev, payload.new as XxxSnapshot]);
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedDate]);

  return { data };
}
```

Rules:

- Always use the `cancelled` flag in fetch effects
- Always clean up realtime channels
- `initialData` param only on hooks SSR-fetched in `page.tsx`

---

## Lightweight Charts Component Structure

```typescript
"use client";
import { useEffect, useRef } from "react";
import { createChart, LineSeries, UTCTimestamp, IChartApi, ISeriesApi, SeriesType } from "lightweight-charts";

export default function XxxChart({ data }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<SeriesType> | null>(null);

  // Effect 1 — chart creation
  useEffect(() => {
    if (!containerRef.current) return;
    const chart = createChart(containerRef.current, { /* options */ });
    const series = chart.addSeries(LineSeries, { /* options */ });
    chartRef.current = chart;
    seriesRef.current = series;
    const handleResize = () => {
      if (containerRef.current) chart.applyOptions({ width: containerRef.current.clientWidth });
    };
    window.addEventListener("resize", handleResize);
    return () => { window.removeEventListener("resize", handleResize); chart.remove(); };
  }, []);

  // Effect 2 — data update
  useEffect(() => {
    if (!seriesRef.current || !chartRef.current) return;
    const points = data
      .map(s => ({
        time: Math.floor(new Date(s.created_at).getTime() / 1000) as UTCTimestamp,
        value: s.value,
      }))
      .filter((p, i, arr) => i === 0 || p.time > arr[i - 1].time);
    seriesRef.current.setData(points);
    try { chartRef.current.timeScale().fitContent(); } catch {}
  }, [data]);

  return <div ref={containerRef} className="w-full h-full" />;
}
```

Rules:

- Always dedup: `.filter((p, i, arr) => i === 0 || p.time > arr[i - 1].time)`
- `shiftVisibleRangeOnNewBar: false` on timeScale
- Wrap `removePriceLine`, `setVisibleRange`, `fitContent` in try/catch

### Price Line Refs Pattern

```typescript
const lineRef = useRef<IPriceLine | null>(null);

// Clear before redrawing:
if (lineRef.current) {
  try { seriesRef.current.removePriceLine(lineRef.current); } catch {}
  lineRef.current = null;
}
lineRef.current = seriesRef.current.createPriceLine({ ... });
```

### Day Separator Lines Pattern

Canvas overlay for multi-day charts:

```typescript
const overlayRef = useRef<HTMLCanvasElement>(null);
const boundariesRef = useRef<UTCTimestamp[]>([]);

const drawSeparators = useCallback(() => {
  if (!overlayRef.current || !chartRef.current || !containerRef.current) return;
  const canvas = overlayRef.current;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const dpr = window.devicePixelRatio || 1;
  const w = containerRef.current.clientWidth;
  const h = CHART_HEIGHT;
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
    ctx.strokeStyle = "#444";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
    ctx.restore();
  }
}, []);
```

- Subscribe: `chart.timeScale().subscribeVisibleTimeRangeChange(drawSeparators)`
- Unsubscribe on cleanup
- Canvas overlay: `position: absolute`, `pointerEvents: none`, `zIndex: 10`
- `rightOffset: 80` on timeScale (skew chart)

---

## Apache ECharts Pattern

Used in `/analysis` charts only. Two effects: creation + data update.

```typescript
"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef } from "react";
import * as echarts from "echarts";

export default function XxxChart({ data }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const chart = echarts.init(containerRef.current, null, { renderer: "canvas", height: 280 });
    chartRef.current = chart;
    const handleResize = () => chart.resize();
    window.addEventListener("resize", handleResize);
    return () => { window.removeEventListener("resize", handleResize); chart.dispose(); };
  }, []);

  useEffect(() => {
    if (!chartRef.current) return;
    chartRef.current.setOption({ /* option */ });
  }, [data]);

  return <div ref={containerRef} className="w-full rounded overflow-hidden" />;
}
```

ECharts notes:

- Always add `/* eslint-disable @typescript-eslint/no-explicit-any */` at top — ECharts callbacks are `any` typed
- Use `xAxis.type: "category"` not `"time"` for RTH data — time type shows overnight gaps making data compress
- Only add legend entries for series that actually have data (prevents "series not exists" warnings)
- `animation: false` always — cleaner for financial data
- `backgroundColor: "#111111"` on all charts

---

## LiveDashboard — The Orchestrator

Only file that calls all hooks, calls `useLiveTick`, computes today, renders all components.

```typescript
const searchParams = useSearchParams(); // requires Suspense in page.tsx
const today =
  searchParams.get("date") ??
  new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
```

### VIX/VIX1D pattern

```typescript
const vixTick = ticks["VIX"] ?? null;
const vixLast = vixTick?.last ?? null;
const vix1dTick = ticks["VIX1D"] ?? null;
const vix1dLast = vix1dTick?.last ?? null;
const vixRatio =
  vix1dLast && vixLast && vixLast > 0 ? (vix1dLast / vixLast).toFixed(2) : null;
// Ratio amber when >= 1
```

### Opening skew for 1σ levels

```typescript
const openingSkew = useMemo(() => {
  return (
    skewHistory.find(
      (s) =>
        new Date(s.created_at).toLocaleDateString("en-CA", {
          timeZone: "America/New_York",
        }) === today,
    ) ?? null
  );
}, [skewHistory, today]);
```

### Real positions wiring

```typescript
const {
  legs: realLegs,
  streamerSymbols: realSymbols,
  isLoading: realIsLoading,
  error: realError,
} = useRealPositions();

const allSymbols = useMemo(() => {
  const set = new Set(CORE_SYMBOLS);
  for (const e of watchlistEntries) set.add(e.streamerSymbol);
  for (const s of realSymbols) set.add(s);
  return Array.from(set);
}, [watchlistEntries, realSymbols]);
```

---

## useLiveTick — Single Instance Rule

Called once in `LiveDashboard.tsx` only. One WebSocket for the entire app.

`TickData`: `{ bid, ask, mid, prevClose, last }`

- `mid` — Quote events (futures, equities)
- `prevClose` — Summary prevDayClosePrice
- `last` — Trade events — always use for VIX, VIX1D

---

## Analysis Route

- Server component `page.tsx` — auth check via `createSupabaseServerClient`, redirect to `/login` if no user
- SSR fetches: all `straddle_snapshots` + all `skew_snapshots >= 2026-04-02`
- Session grouping done client-side in `AnalysisDashboard.tsx`
- `SessionData` type exported from `AnalysisDashboard.tsx` — used by all chart components

Session grouping logic:

- Group raw snapshots by ET date
- Skip sessions with < 2 snapshots
- Opening = first snapshot, closing = last snapshot
- `realizedMovePct = (realizedMovePts / openingStraddle) * 100`
- Ratio coloring: red >= 1.0x, amber >= 0.7x, blue < 0.7x

---

## Real Positions API

```typescript
// client/app/api/real-positions/route.ts
const rawPositions = await (
  client as any
).balancesAndPositionsService.getPositionsList(accountNumber);
```

OCC symbol parsing: `"SPXW  260417C06820000"` → `{ expiry: "2026-04-17", strike: 6820, optionType: "C" }`

P&L calculation:

```typescript
const sign = leg.direction === "Long" ? 1 : -1;
return sign * (mid - leg.averageOpenPrice) * leg.quantity * leg.multiplier;
```

---

## Poller Conventions

### Wall-clock anchoring

```js
function msUntilNextMinute() {
  return Math.ceil(Date.now() / 60000) * 60000 - Date.now();
}
function currentBarTime() {
  return new Date(Math.floor(Date.now() / 60000) * 60000).toISOString();
}
```

### getIndexLast — spot price for indices

```js
// lib/dxfeed.mjs — listens for Trade event, returns last price or null
const vix = await getIndexLast("VIX");
const vix1d = await getIndexLast("VIX1D");
```

### collectOhlc — quote vs trade symbols

```js
// quoteSymbols: futures/equities — Quote bid/ask mid
// tradeSymbols: indices — Trade event price
const ohlc = await collectOhlc(quoteSymbols, tradeSymbols, COLLECT_MS);
```

### session_summary writes

```js
// Always upsert — safe to re-run
supabase.from("session_summary").upsert(payload, { onConflict: "date" })
// Both writes are fire-and-forget — never block the main cycle
writeOpenSummary({ today, spxMid, atmStrike, straddleMid, esBasis }).catch(...)
writeCloseSummary(getTodayET()).catch(...)
```

### Weekly straddle

```js
// captureWeeklyStraddle(options, spxMid) — Monday open cycle only
// findNearestFriday() — next Friday from ET date, never today
// Reuses options array from runCycle — no extra chain fetch
```

---

## WatchlistStrip — Ticker Pattern

```css
@keyframes ticker {
  0% {
    transform: translateX(0);
  }
  100% {
    transform: translateX(-50%);
  }
}
.ticker-track {
  animation: ticker 80s linear infinite;
}
.ticker-track:hover {
  animation-play-state: paused;
}
```

Items rendered twice: `[...allEntries, ...allEntries]`
Edge fade: `maskImage: "linear-gradient(to right, transparent, black 4%, black 96%, transparent)"`
Price: `mid === null || mid === 0 ? last : mid`

---

## WorldClock — ET Offset Pattern

```typescript
function getUTCOffset(timezone: string): number {
  const str = new Date().toLocaleString("en-US", {
    timeZone: timezone,
    timeZoneName: "shortOffset",
  });
  const match = str.match(/GMT([+-]\d+(?::\d+)?)/);
  if (!match) return 0;
  const parts = match[1].split(":");
  const sign = Math.sign(parseInt(parts[0]));
  return parseInt(parts[0]) + (parts[1] ? (parseInt(parts[1]) / 60) * sign : 0);
}
function getETOffset(timezone: string): string {
  const diff = getUTCOffset(timezone) - getUTCOffset("America/New_York");
  if (diff === 0) return "ET+0";
  return diff > 0 ? `ET+${diff}` : `ET${diff}`;
}
```

---

## Types

All in `client/app/types.ts`:

```
StraddleSnapshot   includes es_basis?: number | null
RtmSession
FlySnapshot
SkewSnapshot
EsSnapshot         includes bar_time?: string | null
SpxSnapshot        includes bar_time?: string | null
```

Add when building new hooks:

```
VixSnapshot        vix_snapshots — bar_time, open, high, low, close
Vix1dSnapshot      vix1d_snapshots
SessionSummary     session_summary
WeeklyStraddleSnapshot  weekly_straddle_snapshots
```

Types from API routes:

```
MacroEvent         api/macro-events/route.ts
WatchlistEntry     api/watchlist/route.ts
PositionLeg        api/real-positions/route.ts
SessionData        analysis/AnalysisDashboard.tsx
```

---

## Dark Theme Color Palette

```
Backgrounds:  #0a0a0a #111111 #1a1a1a #1f1f1f #222222 #2a2a2a
Text:         #9ca3af #888888 #666666 #555555 #444444 #333333
Chart:        #9CA9FF straddle | #60a5fa skew/fly | #737373 SPX dashed
              #444 day separators | #4ade80 open/positive | #f87171 negative/high
              #f59e0b amber/medium/hover | #4ade8066 upside 1σ | #f8717166 downside 1σ
```

---

## Timezone Handling

| Purpose             | Timezone              |
| ------------------- | --------------------- |
| Supabase stored     | UTC                   |
| Market hours gating | America/New_York (ET) |
| Display             | America/Chicago (CT)  |
| Date strings        | America/New_York (ET) |

---

## Auth Conventions

- `proxy.ts` not `middleware.ts` (Next.js 16)
- `createSupabaseServerClient()` in server components and actions
- `createBrowserClient` in browser — never plain `createClient`
- Analysis route: `const { data: { user } } = await supabase.auth.getUser(); if (!user) redirect("/login");`
