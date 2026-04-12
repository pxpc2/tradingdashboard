# Agents — Coding Conventions

Guidelines for writing code that fits the vovonacci dashboard. Read CLAUDE.md first for full project context.

---

## The Golden Rule

**Hooks own data. Components own UI. Never mix.**

- All Supabase calls live in `hooks/` or in Next.js API routes (`api/`)
- View components receive everything as props — no `supabase` imports inside components
- Chart components receive typed data arrays as props — no business logic inside them

**Exception**: `PositionsPanel.tsx` includes an inline SML input form that writes to Supabase. Acceptable for simple forms tightly coupled to a component.

---

## CRITICAL: Always Ask for Current File First

Pedro frequently makes his own visual and text tweaks between sessions (font sizes, colors, labels, translations, etc.). **Always request the current file before modifying it.** Never code on top of a file from earlier in the conversation without confirming it's still current. When in doubt, ask.

---

## Hook Structure

Every data hook follows the same two-effect pattern:

```typescript
"use client";

import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { XxxSnapshot } from "../types";

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
- Always clean up realtime channels in return
- `initialData` param only on hooks whose data is SSR-fetched in `page.tsx`

### useSkewHistory — Full Historical Data

No date param. Always fetches all skew data from April 2, 2026 onwards.

```typescript
export function useSkewHistory() {
  // Fetches ALL skew >= '2026-04-02'
  // Returns: { skewHistory, latestSkew, avgSkew, isLoading }
}
```

---

## Lightweight Charts Component Structure

Two effects: creation (deps `[]`), data update (deps `[data]`).

```typescript
"use client";
import { useEffect, useRef } from "react";
import { createChart, LineSeries, UTCTimestamp, IChartApi, ISeriesApi, SeriesType } from "lightweight-charts";

export default function XxxChart({ data }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<SeriesType> | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const chart = createChart(containerRef.current, { /* options */ });
    const series = chart.addSeries(LineSeries, { /* options */ });
    chartRef.current = chart;
    seriesRef.current = series;
    return () => chart.remove();
  }, []);

  useEffect(() => {
    if (!seriesRef.current || !chartRef.current) return;
    const points = data
      .map(s => ({
        time: Math.floor(new Date(s.created_at).getTime() / 1000) as UTCTimestamp,
        value: s.value,
      }))
      .filter((p, i, arr) => i === 0 || p.time > arr[i - 1].time);
    seriesRef.current.setData(points);
    chartRef.current.timeScale().fitContent();
  }, [data]);

  return <div ref={containerRef} className="w-full h-full" />;
}
```

Rules:

- Always dedup: `.filter((p, i, arr) => i === 0 || p.time > arr[i - 1].time)`
- `shiftVisibleRangeOnNewBar: false` on timeScale
- Wrap `removePriceLine`, `setVisibleRange`, `fitContent` in try/catch
- Resize: `window.addEventListener("resize", handleResize)` + cleanup

### Day Separator Lines Pattern (Lightweight Charts)

For multi-day charts, draw dashed vertical lines via canvas overlay:

```typescript
const overlayRef = useRef<HTMLCanvasElement>(null);
const boundariesRef = useRef<UTCTimestamp[]>([]);

function findDayBoundaries(data: XxxSnapshot[]): UTCTimestamp[] {
  const boundaries: UTCTimestamp[] = [];
  let prevDate: string | null = null;
  for (const s of data) {
    const etDate = new Date(s.created_at).toLocaleDateString("en-CA", {
      timeZone: "America/New_York",
    });
    if (prevDate !== null && etDate !== prevDate) {
      boundaries.push(
        Math.floor(new Date(s.created_at).getTime() / 1000) as UTCTimestamp,
      );
    }
    prevDate = etDate;
  }
  return boundaries;
}

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
    ctx.strokeStyle = "#949494";
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
- Call `drawSeparators()` at end of data update effect
- Canvas overlay: `position: absolute`, `pointerEvents: none`, `zIndex: 10`
- Add `rightOffset: 10` to timeScale

---

## Apache ECharts — Planned Migration

`StraddleSpxChart` and `SkewHistoryChart` are being migrated to ECharts. Future candle charts (ES, SPX, VIX, VIX1D) will be built in ECharts from the start.

General ECharts component pattern:

```typescript
"use client";
import { useEffect, useRef } from "react";
import * as echarts from "echarts";

export default function XxxChart({ data }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const chart = echarts.init(containerRef.current, null, { renderer: "canvas" });
    chartRef.current = chart;
    const handleResize = () => chart.resize();
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
      chart.dispose();
    };
  }, []);

  useEffect(() => {
    if (!chartRef.current) return;
    chartRef.current.setOption({ /* option */ });
  }, [data]);

  return <div ref={containerRef} className="w-full h-full" />;
}
```

ECharts advantages over Lightweight Charts for this use case:

- First-class candlestick series
- Cleaner dual Y-axis (yAxis array)
- Native `markLine` / `markArea` for day separators and level lines (no canvas hack)
- Built-in `dataZoom` for brush/scroll zoom
- Richer crosshair tooltip

---

## LiveDashboard — The Orchestrator

`LiveDashboard.tsx` is the only file that:

- Calls all data hooks
- Calls `useLiveTick` with combined symbol list
- Computes today from ET date
- Renders all child components with props
- Imports and calls `signOut`

```typescript
const today = new Date().toLocaleDateString("en-CA", {
  timeZone: "America/New_York",
});
```

### VIX/VIX1D in LiveDashboard

```typescript
const vixTick = ticks["VIX"] ?? null;
const vixLast = vixTick?.last ?? null;
const vixPct = pctChange(vixLast, vixTick?.prevClose ?? null);
```

Always use `tick.last` — bid/ask/mid are 0 for indices.

---

## useLiveTick — Single Instance Rule

Called once in `LiveDashboard.tsx` only. One WebSocket for the entire app.

`TickData`: `{ bid, ask, mid, prevClose, last }`

- `mid` — Quote events (futures, equities)
- `prevClose` — Summary `prevDayClosePrice`
- `last` — Trade events (VIX, VIX1D, SPX index — use this for display)

---

## Poller Conventions

### Wall-clock anchoring — always use these, never fixed timeouts

```js
// msUntilNextMinute — from lib/market-hours.mjs
function msUntilNextMinute() {
  const now = Date.now();
  return Math.ceil(now / 60000) * 60000 - now;
}

// currentBarTime — snapshot before collection begins
function currentBarTime() {
  return new Date(Math.floor(Date.now() / 60000) * 60000).toISOString();
}
```

### collectOhlc — quote vs trade symbols

```js
// quoteSymbols: futures/equities — use Quote bid/ask mid
// tradeSymbols: indices (VIX, VIX1D) — use Trade event price
const ohlc = await collectOhlc(quoteSymbols, tradeSymbols, COLLECT_MS);
```

### ES symbol rollover

Current: `/ESM26:XCME`. Next roll September 2026 → `/ESU26:XCME`.
Update in `loops/ohlc.mjs` and `loops/main.mjs`. Format: `/ES{H|M|U|Z}{2-digit-year}:XCME`.

---

## WatchlistStrip — Ticker Pattern

```typescript
// Render twice for seamless loop
{[...allEntries, ...allEntries].map((entry, i) => (
  <TickerItem key={`${entry.symbol}-${i}`} entry={entry} ticks={ticks} />
))}
```

CSS:

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

Edge fade: `maskImage: "linear-gradient(to right, transparent, black 4%, black 96%, transparent)"`

SPX and ES always prepended as static entries, filtered from Tastytrade list to avoid duplicates.
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

Always computed at render time — DST-aware automatically.

---

## Typography Conventions

- **Labels**: `font-sans text-xs text-[#555] uppercase tracking-wide`
- **Values**: `font-mono text-lg text-[#9ca3af] font-light`
- **Small labels**: `font-sans text-[11px] text-[#555] uppercase tracking-wide`
- **Metric strips**: `flex gap-6 flex-wrap`
- **Pipe dividers**: `w-px bg-[#1f1f1f]`

---

## Mobile Responsive Conventions

- Base = mobile, `md:` = desktop (768px)
- Watchlist: `hidden md:block` in header
- Padding: `px-4 md:px-6`, `py-4 md:py-5`

---

## Types

All in `client/app/types.ts`:

```
StraddleSnapshot   straddle_snapshots — includes es_basis?: number | null
RtmSession         rtm_sessions
FlySnapshot        sml_fly_snapshots
SkewSnapshot       skew_snapshots
EsSnapshot         es_snapshots — includes bar_time?: string | null
SpxSnapshot        spx_snapshots — includes bar_time?: string | null
```

Add when building new hooks:

```
VixSnapshot        vix_snapshots — bar_time, open, high, low, close
Vix1dSnapshot      vix1d_snapshots — bar_time, open, high, low, close
```

Types exported from API routes (not in types.ts):

```
MacroEvent         from api/macro-events/route.ts
WatchlistEntry     from api/watchlist/route.ts
```

---

## Dark Theme Color Palette

```
Backgrounds:
  #0a0a0a   page background
  #111111   component background, chart background
  #1a1a1a   subtle surface, grid lines, topbar border
  #1f1f1f   pipe dividers
  #222222   section dividers
  #2a2a2a   closed state accent

Text:
  #9ca3af   metric values
  #888888   active state
  #666666   labels
  #555555   secondary labels
  #444444   tertiary text
  #333333   near-invisible hints

Chart / indicators:
  #9CA9FF   straddle series
  #60a5fa   skew series, fly 10W, auction dot
  #737373   SPX overlay (dashed)
  #949494   day separator lines
  #4ade80   open state, positive %
  #f87171   negative %, high impact
  #f59e0b   amber highlight, medium impact, realized >=70%, clock hover
```

---

## Timezone Handling

| Purpose             | Timezone              |
| ------------------- | --------------------- |
| Supabase stored     | UTC                   |
| Market hours gating | America/New_York (ET) |
| Display             | America/Chicago (CT)  |
| Date strings        | America/New_York (ET) |

RTH open = 09:30 ET = **13:30 UTC** during DST.

---

## Auth Conventions

- `proxy.ts` not `middleware.ts` (Next.js 16)
- `createSupabaseServerClient()` in server actions
- `createBrowserClient` in browser — never plain `createClient`
