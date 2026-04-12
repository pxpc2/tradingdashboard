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

### Price Line Refs Pattern

When using `createPriceLine` (e.g. skew 1σ levels), always store refs and clear before redrawing:

```typescript
const downsideLineRef = useRef<IPriceLine | null>(null);

// In data effect — clear first:
if (downsideLineRef.current) {
  try { seriesRef.current.removePriceLine(downsideLineRef.current); } catch {}
  downsideLineRef.current = null;
}

// Then recreate:
downsideLineRef.current = seriesRef.current.createPriceLine({ ... });
```

### Day Separator Lines Pattern

Canvas overlay for multi-day charts:

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
- Call `drawSeparators()` at end of data update effect
- Canvas overlay: `position: absolute`, `pointerEvents: none`, `zIndex: 10`
- Add `rightOffset: 80` to timeScale (skew chart)

---

## ECharts — Parked

ECharts migration was attempted but parked. The core issue: `xAxis.type: 'time'` renders full 24h timeline including overnight gaps, making RTH data compress into narrow spikes. Switching to `type: 'category'` eliminates gaps but loses proportional time spacing.

Revisit when building candlestick charts for ES/SPX/VIX/VIX1D — ECharts has clear advantages there (native candlestick, dataZoom, markLine). For existing line charts, Lightweight Charts stays.

---

## LiveDashboard — The Orchestrator

`LiveDashboard.tsx` is the only file that:

- Calls all data hooks
- Calls `useLiveTick` with combined symbol list
- Computes today from ET date (with `?date=` param override for dev)
- Renders all child components with props
- Imports and calls `signOut`

```typescript
// Normal: uses ET today
// Dev override: ?date=2026-04-09 in URL
const searchParams = useSearchParams();
const today =
  searchParams.get("date") ??
  new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
```

Requires `<Suspense>` wrapper in `page.tsx` due to `useSearchParams`.

### VIX/VIX1D pattern

```typescript
const vixTick = ticks["VIX"] ?? null;
const vixLast = vixTick?.last ?? null;
const vixPct = pctChange(vixLast, vixTick?.prevClose ?? null);

const vix1dTick = ticks["VIX1D"] ?? null;
const vix1dLast = vix1dTick?.last ?? null;
const vix1dPct = pctChange(vix1dLast, vix1dTick?.prevClose ?? null);

const vixRatio =
  vix1dLast && vixLast && vixLast > 0 ? (vix1dLast / vixLast).toFixed(2) : null;
// Ratio color: amber (#f59e0b) when >= 1, neutral otherwise
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

Pass as `openingSkew={openingSkew}` to `StraddleSpxChart`.

---

## useLiveTick — Single Instance Rule

Called once in `LiveDashboard.tsx` only. One WebSocket for the entire app.

`TickData`: `{ bid, ask, mid, prevClose, last }`

- `mid` — Quote events (futures, equities)
- `prevClose` — Summary `prevDayClosePrice`
- `last` — Trade events — use for VIX, VIX1D, and any index

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

Never use fixed `setTimeout(fn, 60000)`.

### getIndexLast — for VIX/VIX1D spot fetch

```js
// lib/dxfeed.mjs
export async function getIndexLast(symbol) {
  // Listens for Trade event with price > 0
  // Returns the last price or null on timeout
}
```

Use this whenever you need a spot price for an index (VIX, VIX1D) in the poller.

### collectOhlc — quote vs trade symbols

```js
// quoteSymbols: futures/equities — use Quote bid/ask mid
// tradeSymbols: indices — use Trade event price
const ohlc = await collectOhlc(quoteSymbols, tradeSymbols, COLLECT_MS);
```

### session_summary writes

```js
// Always upsert, never insert — safe to re-run
supabase.from("session_summary").upsert(payload, { onConflict: "date" })

// writeOpenSummary — fire and forget from runAndScheduleNext:
writeOpenSummary({ today, spxMid, atmStrike, straddleMid, esBasis })
  .catch((err) => console.error(...));

// writeCloseSummary — fire and forget at 16:00 ET:
writeCloseSummary(getTodayET())
  .catch((err) => console.error(...));
```

Opening skew fields may be null at 09:30 (first skew fires at ~09:35). This is expected — raw data is in `skew_snapshots`.

### Opening price convention

- **ATM strike selection**: uses `DXFeed Summary.openPrice`
- **spx_ref stored**: uses `DXFeed Quote mid`
- **FMP 09:30 bar**: logged for comparison only, not used for any decision
- Do not change the source until validated over multiple sessions

### ES symbol rollover

Current: `/ESM26:XCME`. Next roll September 2026 → `/ESU26:XCME`.
Update in `loops/ohlc.mjs` (ES_SYMBOL const) and `loops/main.mjs` (ES_SYMBOL import).

---

## WatchlistStrip — Ticker Pattern

```typescript
{[...allEntries, ...allEntries].map((entry, i) => (
  <TickerItem key={`${entry.symbol}-${i}`} entry={entry} ticks={ticks} />
))}
```

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

## Types

All in `client/app/types.ts`:

```
StraddleSnapshot   straddle_snapshots — includes es_basis?: number | null
RtmSession         rtm_sessions
FlySnapshot        sml_fly_snapshots
SkewSnapshot       skew_snapshots
EsSnapshot         es_snapshots — includes bar_time?: string | null
SpxSnapshot        spx_snapshots — includes bar_time?: string | null
SessionSummary     session_summary — add when building /analysis hooks
```

Add when building new hooks:

```
VixSnapshot        vix_snapshots — bar_time, open, high, low, close
Vix1dSnapshot      vix1d_snapshots — bar_time, open, high, low, close
```

Types from API routes (not in types.ts):

```
MacroEvent         api/macro-events/route.ts
WatchlistEntry     api/watchlist/route.ts
```

---

## Dark Theme Color Palette

```
Backgrounds:
  #0a0a0a   page background
  #111111   component / chart background
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
  #444       day separator lines (skew chart)
  #4ade80   open state, positive %, upside 1σ level
  #f87171   negative %, high impact, downside 1σ level
  #f59e0b   amber: medium impact, realized ≥70%, clock hover, VIX1D/VIX ≥ 1
  #4ade8066 upside 1σ line (semi-transparent)
  #f8717166 downside 1σ line (semi-transparent)
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
