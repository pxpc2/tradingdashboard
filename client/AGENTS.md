# Agents — Coding Conventions

Guidelines for writing code that fits the vovonacci dashboard. Read CLAUDE.md first for full project context.

---

## The Golden Rule

**Hooks own data. Components own UI. Never mix.**

- All Supabase calls live in `hooks/` or in Next.js API routes (`api/`)
- View components receive everything as props — no `supabase` imports inside components
- Chart components receive typed data arrays as props — no business logic inside them

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
- Always clean up realtime channels in the return of the subscription effect
- Expose patch functions from the hook when local state needs immediate mutation
- `initialData` param only on hooks whose data is SSR-fetched in `page.tsx`

### Exception: useEsData

`useEsData` does NOT use the standard date range query. ES data spans UTC day boundaries
(overnight globex session), so it queries a 48hr window with NO `.limit()` in code:

```typescript
const from = `${prevDay}T06:00:00Z`;
const to = `${nextDay}T06:00:00Z`;
```

Row limit is controlled via Supabase dashboard setting (currently 15,000). Do not add
`.limit()` to this query — it would re-introduce the truncation bug.

---

## View Component Structure

```typescript
"use client";

import SomeChart from "./SomeChart";
import { XxxSnapshot } from "../types";

type Props = {
  data: XxxSnapshot[];
  selectedDate: string;
};

export default function XxxView({ data, selectedDate }: Props) {
  const latest = data[data.length - 1];
  return (
    <div>
      <SomeChart data={data} selectedDate={selectedDate} />
    </div>
  );
}
```

Rules:

- Props only — no hooks that touch Supabase
- Local `useState` fine for UI-only state
- Derive computed values inline from props — no separate state for these
- Exception: `MktView` fetches PDH/PDL via `/api/pdhl` — acceptable as one-shot API call

---

## Chart Component Structure

Two effects: one for chart creation (deps `[]`), one for data update (deps `[data, selectedDate]`).

```typescript
"use client";

import { useEffect, useRef } from "react";
import {
  createChart, LineSeries, UTCTimestamp,
  IChartApi, ISeriesApi, SeriesType,
  createTextWatermark,
} from "lightweight-charts";
import { XxxSnapshot } from "../types";

type Props = {
  data: XxxSnapshot[];
  selectedDate: string;
};

export default function XxxChart({ data, selectedDate }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<SeriesType> | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const chart = createChart(containerRef.current, { /* options */ });
    const series = chart.addSeries(LineSeries, { /* options */ });
    chartRef.current = chart;
    seriesRef.current = series;
    createTextWatermark(chart.panes()[0], {
      horzAlign: "center",
      vertAlign: "center",
      lines: [{ text: "vovonacci", color: "rgba(204, 204, 204, 0.2)", fontSize: 24 }],
    });
    const handleResize = () => {
      if (containerRef.current)
        chart.applyOptions({ width: containerRef.current.clientWidth });
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
      .map((s) => ({
        time: Math.floor(new Date(s.created_at).getTime() / 1000) as UTCTimestamp,
        value: s.some_value,
      }))
      .filter((p, i, arr) => i === 0 || p.time > arr[i - 1].time);
    seriesRef.current.setData(points);
    try { chartRef.current.timeScale().fitContent(); } catch {}
  }, [data, selectedDate]);

  return <div ref={containerRef} className="w-full rounded-sm overflow-hidden" />;
}
```

Rules:

- Always dedup time series points — filter where `p.time > arr[i-1].time`
- Use `fitContent()` as default — only use `setVisibleRange` when explicitly needed
- **Never use `display:none` on chart containers** — use `visibility/height:0` trick
- Wrap `removePriceLine` and `setVisibleRange` in try/catch
- Price lines use separate refs and separate effects so they update independently
- Live tick updates use minute-bucketed timestamps: `Math.floor(Date.now() / 60000) * 60`
- Only append live ticks when `isToday(selectedDate)` — guard every live tick effect
- Chart overlays (pharm levels, ONH/ONL, PDH/PDL) only shown on today — clear and skip on past dates
- All charts use `createTextWatermark` for the "vovonacci" watermark

---

## Tab Switching — Never Unmount Views

All three tab views (MKT/VOL/POS) must stay mounted at all times. Use visibility trick in Dashboard:

```tsx
<div style={{
  visibility: activeTab === "MKT" ? "visible" : "hidden",
  height: activeTab === "MKT" ? "auto" : "0",
  overflow: "hidden",
}}>
  <MktView ... />
</div>
```

This prevents Lightweight Charts instances from being destroyed, WebSockets from disconnecting,
and state from resetting on tab switch. Never revert to conditional `{activeTab === "X" && <View />}`.

---

## useLiveTick — Single Instance Rule

`useLiveTick` must only be called once, in `Dashboard.tsx`. It opens one WebSocket for the entire app.

```typescript
// Dashboard.tsx
const CORE_SYMBOLS = ["SPX", ES_STREAMER_SYMBOL];

const allSymbols = useMemo(() => {
  const set = new Set(CORE_SYMBOLS);
  for (const e of watchlistEntries) set.add(e.streamerSymbol);
  return Array.from(set);
}, [watchlistEntries]);

const ticks = useLiveTick(allSymbols);
```

`TickData` type:

```typescript
export type TickData = {
  bid: number;
  ask: number;
  mid: number;
  prevClose: number | null;
  last: number | null;
};
```

- `mid` — from Quote events, used for equities and futures
- `prevClose` — from Summary `prevDayClosePrice`, used for % change calculations
- `last` — from Trade events, used for VIX and indices that have no bid/ask

Subscriptions per symbol: Quote + Summary + Trade (three event types, one channel).

---

## Typography Conventions

All UI text follows this pattern:

- **Labels**: `font-sans text-[10px] text-[#666] uppercase tracking-widest`
- **Values/numbers**: `font-mono font-light text-lg text-[#9ca3af]`
- **Metric strips**: `flex-nowrap overflow-x-auto` — single line, scrolls horizontally, never wraps
- **Pipe dividers**: `w-px h-4 bg-[#1f1f1f] shrink-0` between metric groups
- **Section headers**: left-border accent + label + optional live price + % change

Section header pattern:

```tsx
<div className="flex items-center gap-3 mb-3">
  <div
    className="w-0.5 h-4"
    style={{ backgroundColor: isOpen ? "#4ade80" : "#2a2a2a", borderRadius: 0 }}
  />
  <span className="font-sans text-[10px] text-[#666] uppercase tracking-widest">
    SYMBOL
  </span>
  <span className="font-mono font-light text-sm text-[#666]">
    {price.toFixed(2)}
  </span>
  <span className="font-mono text-xs" style={{ color: pctColor }}>
    {pct}%
  </span>
</div>
```

CT clock in metric strip — pushed right with `ml-auto`:

```tsx
<div className="w-px h-4 bg-[#1f1f1f] shrink-0 ml-auto" />
<div className="flex items-baseline gap-1.5 shrink-0">
  <span className="font-sans text-[10px] text-[#444] uppercase tracking-widest">CT</span>
  <span className="font-mono font-light text-lg text-[#444]">{nowCt}</span>
</div>
```

---

## Watchlist Route — Auth Pattern

The watchlist route uses the Tastytrade SDK's OAuth flow. Always follow this pattern:

```typescript
const client = new TastytradeClient({
  /* config */
});
await client.quoteStreamer.connect(); // triggers OAuth
await client.quoteStreamer.disconnect();
const token = (client.httpClient as any).accessToken?.token;
// use: headers: { Authorization: `Bearer ${token}` }
// or: await client.watchlistsService.getAllWatchlists()  (SDK handles auth internally)
```

For futures front month resolution:

```typescript
const activeFuture = futures
  ?.filter(
    (f) =>
      f["active"] === true &&
      new Date(f["expiration-date"]) > now &&
      f["future-product"]?.["root-symbol"] === rootSymbol,
  )
  ?.sort(
    (a, b) =>
      new Date(a["expiration-date"]).getTime() -
      new Date(b["expiration-date"]).getTime(),
  )?.[0];
```

---

## Macro Events Route — Caching Pattern

```typescript
const isToday =
  date ===
  new Date().toLocaleDateString("en-CA", {
    timeZone: "America/New_York",
  });

const res = await fetch(fmpUrl, {
  next: { revalidate: isToday ? 60 : 86400 },
});
```

Today revalidates every 60s (actuals fill in during session). Past dates cached 24hrs.

---

## Types

All shared types live in `client/app/types.ts`.

```typescript
import { StraddleSnapshot, EsSnapshot, PharmLevel } from "../types";
```

Never redeclare types inline. Current types:

```
StraddleSnapshot   straddle_snapshots — includes es_basis?: number | null
RtmSession         rtm_sessions
FlySnapshot        sml_fly_snapshots
SkewSnapshot       skew_snapshots
EsSnapshot         es_snapshots — includes open/high/low as optional nullable
SpxSnapshot        spx_snapshots — open/high/low/close all required
PharmLevel         parsed from pharm_levels content — not a Supabase row type
                   { high, low, label, isKey, source }
```

Types exported from API routes (not in types.ts):

```
MacroEvent         exported from api/macro-events/route.ts
WatchlistEntry     exported from api/watchlist/route.ts — includes marketSector
```

If a new Supabase column is added, update `types.ts` first.

---

## Dashboard / Tab Logic

`Dashboard.tsx` is the only file that:

- Calls all data hooks
- Owns `selectedDate` state and tab state
- Calls `useLiveTick` with combined symbol list
- Calls `useWatchlist` to get entries
- Computes ONH/ONL inline (pure function, no state/effects)
- Passes ticks + watchlistEntries down to MktView
- Imports and calls `signOut` server action
- Renders `EsSpxConverter` in topbar with `compact` prop

When adding a new view:

1. Create hook in `hooks/` if new data needed
2. Create view component in `components/`
3. Import and wire in `Dashboard.tsx` only
4. Add visibility/height:0 wrapper — never conditional rendering

---

## Dark Theme Color Palette

```
Backgrounds:
  #0a0a0a   page background
  #111111   component background, chart background
  #1a1a1a   subtle surface, grid lines, chart borders, topbar border
  #1f1f1f   pipe dividers, input background
  #222222   section dividers (border-[#222])
  #2a2a2a   section header accent (closed state), watchlist closed border base

Text:
  #ffffff   primary
  #9ca3af   metric values (gray-400)
  #888888   active tab, secondary labels
  #666666   metric labels, chart header labels
  #444444   chart text, inactive tabs, CT clock
  #333333   near-invisible hints, category labels in watchlist/macro

Chart series / indicators:
  #9CA9FF   straddle series (blue-purple)
  #60a5fa   fly 10W, auction event dot/text in MacroEvents
  #fb923c   fly 20W
  #34d399   fly 25W, ES output in converter
  #f472b6   fly 30W
  #4ade80   open state (section header accent, % change positive, watchlist open border)
  #f87171   % change negative, realized >= 100%, watchlist closed border
  #f59e0b   realized >= 70%, Medium impact dot in MacroEvents
  #265C4D   implied high/low lines, PDH/PDL lines (dark green)
  #737373   SPX/ES price line series color
  #CF7C00   price line color on SPX and ES charts (orange)
  #3b4f7a   weekly pharm levels (dark blue)
  #444444   daily pharm levels (gray)
  #2a6b6b   ONH/ONL lines (teal)
```

---

## Timezone Handling

| Purpose                                 | Timezone              |
| --------------------------------------- | --------------------- |
| Supabase timestamps (stored)            | UTC                   |
| Market hours gating (poller + frontend) | America/New_York (ET) |
| Chart tick labels, time display         | America/Chicago (CT)  |
| Date picker / `en-CA` locale dates      | America/New_York (ET) |

**Critical**: ET is UTC-4 during DST (currently active). RTH open = 09:30 ET = **13:30 UTC**.
Never use `T14:30:00Z` for RTH open — that would be 10:30 ET.

Pattern for today's ET date string:

```typescript
const today = new Date().toLocaleDateString("en-CA", {
  timeZone: "America/New_York",
});
```

Pattern for CT display:

```typescript
new Date(timestamp).toLocaleTimeString("en-US", {
  timeZone: "America/Chicago",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});
```

---

## Poller Conventions

- All DB inserts wrapped in `withTimeout(supabase.from(...).insert(...), 10000, "label")`
- All quote fetches wrapped in `withTimeout(new Promise(...), 15000, "label")`
- Log format: `[${nowCT()}] message` — CT time, messages in Portuguese
- Abort early and log rather than inserting bad data
- `isOpenCycle` flag gates open-cycle-only logic in `runCycle()`
- Two independent loops: `runAndScheduleNext()` (options, RTH only) and `runOhlcLoop()` (OHLC)
- OHLC loop: `collectOhlc(symbols, 55000)` → insert → 5s gap → repeat
- ES symbol: `/ESM26:XCME` — update quarterly (next: Sep 2026 → `/ESU26:XCME`)
- Service role key used for all Supabase writes (bypasses RLS)
- Known issue: DXFeed auth may drop after extended uptime — redeploy to fix, permanent fix pending

---

## Auth Conventions

- Login/signOut are server actions in `app/login/actions.ts`
- `proxy.ts` (not `middleware.ts` — Next.js 16) exports `proxy` function and `config`
- Use `createSupabaseServerClient()` from `lib/supabase-server.ts` in server actions
- Use `createBrowserClient` from `@supabase/ssr` in `lib/supabase.ts` — carries session cookies for RLS
- Never use plain `createClient` from `@supabase/supabase-js` in browser context — RLS writes will fail
