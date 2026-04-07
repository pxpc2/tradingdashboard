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
(overnight globex session), so it queries a 48hr window:

```typescript
const from = `${prevDay}T06:00:00Z`;
const to = `${nextDay}T06:00:00Z`;
```

This captures all rows that belong to a CT date regardless of their UTC timestamp.

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
  IChartApi, ISeriesApi, SeriesType
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

If a new Supabase column is added, update `types.ts` first.

---

## Dashboard / Tab Logic

`Dashboard.tsx` is the only file that:

- Calls hooks
- Owns `selectedDate` state
- Owns tab state
- Passes data down as props to view components
- Imports and calls `signOut` server action

When adding a new view:

1. Create the hook in `hooks/` if new data is needed
2. Create the view component in `components/`
3. Import and wire in `Dashboard.tsx` only

---

## Dark Theme Color Palette

```
Backgrounds:
  #0a0a0a   page background
  #111111   component background, chart background
  #1a1a1a   subtle surface, grid lines, borders
  #1f1f1f   active tab background, input background
  #2a2a2a   borders, dividers

Text:
  #ffffff   primary
  #888888   secondary labels
  #666666   tertiary
  #444444   very muted, chart text, inactive tabs
  #333333   near-invisible hints
  gray-400  Tailwind alias for metric labels (~#9ca3af)

Chart series / indicators:
  #9CA9FF   straddle series (blue-purple)
  #60a5fa   fly 10W
  #fb923c   fly 20W, orange live dot (ES open SPX closed)
  #34d399   fly 25W, ES output in converter
  #f472b6   fly 30W
  #4ade80   live indicator green
  #f59e0b   live indicator amber
  #f87171   live indicator red
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
- Two independent loops: `runAndScheduleNext()` (options, RTH only) and `runOhlcLoop()` (OHLC, ES globex + SPX RTH)
- OHLC loop: `collectOhlc(symbols, 55000)` collects ticks for 55s tracking open/high/low/close, then inserts, then 5s gap
- ES symbol: `/ESM26:XCME` — update quarterly (next: Sep 2026 → `/ESU26:XCME`)
- Service role key used for all Supabase writes (bypasses RLS)

---

## Auth Conventions

- Login/signOut are server actions in `app/login/actions.ts`
- `proxy.ts` (not `middleware.ts` — Next.js 16) exports `proxy` function and `config`
- Use `createSupabaseServerClient()` from `lib/supabase-server.ts` in server actions
- Use `createBrowserClient` from `@supabase/ssr` in `lib/supabase.ts` — carries session cookies for RLS
- Never use plain `createClient` from `@supabase/supabase-js` in browser context — RLS writes will fail
