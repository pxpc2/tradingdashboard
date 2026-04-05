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

- Always use the `cancelled` flag in fetch effects — prevents stale setState on fast date changes
- Always clean up realtime channels in the return of the subscription effect
- Expose patch functions (e.g. `patchEntryMid`) from the hook when local state needs to be mutated after a Supabase update, so the UI reacts immediately without a reload
- `initialData` param exists only on hooks whose data is SSR-fetched in `page.tsx` (currently straddle + fly session)

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
  // derive display values from props only
  return (
    <div>
      {/* metric labels */}
      <SomeChart data={data} selectedDate={selectedDate} />
    </div>
  );
}
```

Rules:

- Props only — no hooks that touch Supabase
- Local `useState` is fine for UI-only state (editing, tooltips, active tab within the view)
- Derive computed values (latest, opening, pnl, pct) inline from props — no separate state for these
- All fetch side effects that depend on `selectedDate` belong in a hook, not a view component
  - Exception: `StraddleView` fetches PDH/PDL via `/api/pdhl` — this is acceptable since it's a one-shot API call, not a Supabase subscription

---

## Chart Component Structure

```typescript
"use client";

import { useEffect, useRef } from "react";
import { createChart, AreaSeries, UTCTimestamp, IChartApi, ISeriesApi, SeriesType } from "lightweight-charts";
import { XxxSnapshot } from "../types";

type Props = {
  data: XxxSnapshot[];
  selectedDate: string;
};

export default function XxxChart({ data, selectedDate }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<SeriesType> | null>(null);

  // Effect 1 — create chart once on mount
  useEffect(() => {
    if (!containerRef.current) return;
    const chart = createChart(containerRef.current, { /* options */ });
    const series = chart.addSeries(AreaSeries, { /* options */ });
    chartRef.current = chart;
    seriesRef.current = series;
    const handleResize = () => {
      if (containerRef.current) chart.applyOptions({ width: containerRef.current.clientWidth });
    };
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
      chart.remove();
    };
  }, []);

  // Effect 2 — update data when props change
  useEffect(() => {
    if (!seriesRef.current || !chartRef.current) return;
    const points = data
      .map((s) => ({
        time: Math.floor(new Date(s.created_at).getTime() / 1000) as UTCTimestamp,
        value: s.some_value,
      }))
      .filter((p, i, arr) => i === 0 || p.time > arr[i - 1].time); // dedup
    seriesRef.current.setData(points);
    // set visible range to market hours
    const marketOpen = Math.floor(new Date(`${selectedDate}T13:30:00Z`).getTime() / 1000) as UTCTimestamp;
    const marketClose = Math.floor(new Date(`${selectedDate}T20:00:00Z`).getTime() / 1000) as UTCTimestamp;
    try { chartRef.current.timeScale().setVisibleRange({ from: marketOpen, to: marketClose }); } catch {}
  }, [data, selectedDate]);

  return <div ref={containerRef} className="w-full rounded-sm overflow-hidden" />;
}
```

Rules:

- Two effects: one for chart creation (deps `[]`), one for data update (deps `[data, selectedDate]`)
- Always dedup time series points — filter where `p.time > arr[i-1].time`
- Market hours visible range: `T13:30:00Z` to `T20:00:00Z` (UTC = 08:30–15:00 CT)
- **Never use `display:none` on a chart container** — the chart unmounts and loses state. Use `visibility/height:0` trick instead:
  ```tsx
  style={{
    visibility: isActive ? "visible" : "hidden",
    height: isActive ? "auto" : "0",
    overflow: "hidden",
  }}
  ```
- Price lines (PDH, PDL, implied high/low) use separate refs and separate effects so they update independently of chart data
- Wrap `removePriceLine` and `setVisibleRange` in try/catch — they throw if chart is not ready

---

## Types

All shared types live in `client/app/types.ts`. Import from there everywhere.

```typescript
import {
  StraddleSnapshot,
  FlySnapshot,
  SkewSnapshot,
  RtmSession,
} from "../types";
```

Never redeclare types inline in components or hooks. If a new Supabase column is added, update `types.ts` first.

Current types: `StraddleSnapshot`, `RtmSession`, `FlySnapshot`, `SkewSnapshot`.
`StraddleSnapshot` includes `es_basis?: number | null` — only non-null on the open cycle row.

---

## Dashboard / Tab Logic

`Dashboard.tsx` is the only file that:

- Calls hooks
- Owns `selectedDate` state
- Owns tab/layout state
- Passes data down as props to view components

When adding a new view:

1. Create the hook in `hooks/` if new data is needed
2. Create the view component in `components/`
3. Import and wire in `Dashboard.tsx` only

---

## Dark Theme Color Palette

All UI uses a consistent dark palette. Never use arbitrary hex values — use these:

```
Backgrounds:
  #0a0a0a   page background (set in layout/page)
  #111111   component background, chart background
  #1a1a1a   subtle surface, grid lines, borders
  #1f1f1f   active tab background, input background
  #2a2a2a   borders, dividers

Text:
  #ffffff   primary (headings, active)
  #888888   secondary (labels, muted values)
  #666666   tertiary
  #444444   very muted, inactive tabs
  #333333   near-invisible, hints
  gray-400  Tailwind alias used for metric labels (= ~#9ca3af)

Accent colors (series, indicators):
  #9CA9FF   straddle series, default area (blue-purple)
  #60a5fa   fly 10W
  #fb923c   fly 20W
  #34d399   fly 25W, ES output in converter
  #f472b6   fly 30W
  #4ade80   live indicator green
  #f59e0b   live indicator amber
  #f87171   live indicator red
  #265C4D   implied high/low lines, PDH/PDL lines (dark green)
  #737373   SPX line on straddle chart
```

---

## Timezone Handling

Three timezones are used — be deliberate:

| Purpose                                 | Timezone              |
| --------------------------------------- | --------------------- |
| Supabase timestamps (stored)            | UTC                   |
| Market hours gating (poller + frontend) | America/New_York (ET) |
| Chart tick labels, time display         | America/Chicago (CT)  |
| Date picker / `en-CA` locale dates      | America/New_York (ET) |

Pattern for today's date string:

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
- Log format: `[${nowCT()}] message` — CT time in brackets, then message in Portuguese
- Abort early and log clearly rather than inserting bad data — the skew function is the reference example
- `isOpenCycle` flag passed to `runCycle()` — open-cycle-only logic is gated behind this flag
- Never block the open cycle on optional fetches — ES basis fetch has its own try/catch and is non-blocking
