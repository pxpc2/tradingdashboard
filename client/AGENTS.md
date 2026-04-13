# Agents — Coding Conventions

Read CLAUDE.md first for full project context.

---

## The Golden Rule

**Hooks own data. Components own UI. Never mix.**

Exception: `PositionsPanel.tsx` inline SML form, `TradingPlanDashboard.tsx` plan saves.

---

## CRITICAL: Always Ask for Current File First

Pedro makes visual tweaks between sessions. Never code on top of a file from earlier without confirming it's current.

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

---

## Lightweight Charts Pattern

```typescript
// Effect 1 — creation (deps [])
// Effect 2 — data update (deps [data])
// Always dedup: .filter((p, i, arr) => i === 0 || p.time > arr[i-1].time)
// shiftVisibleRangeOnNewBar: false
// Wrap removePriceLine, fitContent in try/catch
```

### Price Line Refs

```typescript
const lineRef = useRef<IPriceLine | null>(null);
if (lineRef.current) { try { series.removePriceLine(lineRef.current); } catch {} lineRef.current = null; }
lineRef.current = series.createPriceLine({ ... });
```

### Day Separator Canvas Overlay

```typescript
// subscribeVisibleTimeRangeChange(drawSeparators)
// canvas: position absolute, pointerEvents none, zIndex 10
// strokeStyle: "#444", lineWidth: 1, setLineDash([4,4])
// rightOffset: 80 on timeScale (skew chart)
```

---

## ECharts Pattern

```typescript
/* eslint-disable @typescript-eslint/no-explicit-any */
// Always add eslint disable — ECharts callbacks are any typed
// animation: false always
// backgroundColor: "#111111"
// xAxis.type: "category" not "time" for RTH data (time shows overnight gaps)
// Only add legend entries for series that have data
```

---

## LiveDashboard

```typescript
// useSearchParams() for ?date= param — needs Suspense in page.tsx
const today = searchParams.get("date") ?? new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });

// VIX/VIX1D
const vixLast = ticks["VIX"]?.last ?? null;
const vix1dLast = ticks["VIX1D"]?.last ?? null;
const vixRatio = vix1dLast && vixLast && vixLast > 0 ? (vix1dLast / vixLast).toFixed(2) : null;
// Ratio amber when >= 1

// Skew percentile
const skewPctile = useMemo(() => {
  if (!latestSkew || skewHistory.length === 0) return null;
  return Math.round(skewHistory.filter(s => s.skew <= latestSkew.skew).length / skewHistory.length * 100);
}, [latestSkew, skewHistory]);

// Opening skew for 1σ levels
const openingSkew = useMemo(() =>
  skewHistory.find(s => new Date(s.created_at).toLocaleDateString("en-CA", { timeZone: "America/New_York" }) === today) ?? null,
[skewHistory, today]);

// Real positions wiring
const { legs: realLegs, streamerSymbols: realSymbols, ... } = useRealPositions();
const allSymbols = useMemo(() => {
  const set = new Set(CORE_SYMBOLS);
  for (const e of watchlistEntries) set.add(e.streamerSymbol);
  for (const s of realSymbols) set.add(s);
  return Array.from(set);
}, [watchlistEntries, realSymbols]);
```

---

## Real Positions

### API Route (`/api/real-positions`)

```typescript
// balancesAndPositionsService.getPositionsList(accountNumber)
// Filter: "Equity Option" | "Future Option" only
// Parse createdAt from pos["created-at"]

// OCC equity: "SPXW  260417C06820000" → strike = parseInt(raw) / 1000
// Future opt: "./ESM6 E2AJ6 260413P6750" → strike = parseFloat(raw) as-is
// multiplier comes from API (ES = 50, SPX = 100)
```

### Trade Grouping (PositionsPanel)

```typescript
// 1. Sort legs by createdAt
// 2. Cluster: timeDiff <= 10000ms AND same underlying + expiry + optionType
// 3. Classify:
//    1 leg → Naked
//    2 legs, opposite dirs, equal qty → Vertical Spread
//    3 legs, symmetric wings, center qty = 2× wing, center opposite dir → Butterfly
//    else → Unknown (show individually)
// 4. P&L = sign * (mid - averageOpenPrice) * quantity * multiplier
//    sign: Long = +1, Short = -1
```

---

## Trading Plan Route

### Regime Scoring

```typescript
function computeScore(plan, skewPctile) {
  // gamma_regime: negative → +2, positive → -2, mixed → 0
  // skewPctile: >75 → +1, <25 → -1, else 0
  // vix1d_vix_ratio: >1.1 → +1, <0.9 → -1, else 0
  // overnight_es_range: "wide" → +1, "tight" → -1, else 0
  // balance_strikes present → -1 (reverting signal), else 0
  // Total max ±6
  // ≥+4 → TRENDING (high-conf), +2/+3 → TRENDING (low-conf)
  // -1/+1 → UNCLEAR
  // -2/-3 → REVERTING (low-conf), ≤-4 → REVERTING (high-conf)
}
```

### Condition Log Entry

```typescript
type ConditionEntry = {
  ts: string; // ISO timestamp — set at time of entry, not editable
  type: "CONFIRM" | "REGIME_BREAK" | "TRADE" | "NOTE";
  note: string;
};
```

### Saves

```typescript
// Always upsert with onConflict: "date"
supabase.from("trading_plans").upsert(payload, { onConflict: "date" });
// computeScore() called on every save to keep regime_bias current
```

---

## Analysis Route

Session grouping in `AnalysisDashboard.tsx` client-side:

```typescript
// Group straddle_snapshots by ET date
// Skip sessions with < 2 snapshots
// realizedMovePct = (realizedMovePts / openingStraddle) * 100
// Ratio colors: red ≥ 100%, amber ≥ 70%, blue < 70%
```

`SessionData` type exported from `AnalysisDashboard.tsx` — used by all chart components.

---

## Poller Conventions

```js
// Wall-clock anchoring
function msUntilNextMinute() {
  return Math.ceil(Date.now() / 60000) * 60000 - Date.now();
}
function currentBarTime() {
  return new Date(Math.floor(Date.now() / 60000) * 60000).toISOString();
}

// getIndexLast(symbol) — Trade event last price for VIX/VIX1D
// collectOhlc(quoteSymbols, tradeSymbols, ms) — quote=bid/ask mid, trade=last price
// session_summary + trading_plans: always upsert onConflict date
// writeOpenSummary / writeCloseSummary: fire-and-forget (.catch wrapped)
// captureWeeklyStraddle: Monday open cycle only, reuses options array
```

---

## WatchlistStrip Ticker

```css
/* Items rendered twice: [...entries, ...entries] */
/* animation: ticker 80s linear infinite */
/* :hover → animation-play-state: paused */
/* maskImage fade edges */
/* Price: mid === 0 ? last : mid */
```

## WorldClock ET Offset

```typescript
// getUTCOffset(tz) via Intl shortOffset — DST-aware
// getETOffset(tz) = diff from America/New_York
// Never hardcode offsets
```

---

## Types

`client/app/types.ts`:

```
StraddleSnapshot  EsSnapshot (bar_time)  SpxSnapshot (bar_time)
RtmSession  FlySnapshot  SkewSnapshot
```

From API routes:

```
PositionLeg       — api/real-positions/route.ts (includes createdAt)
WatchlistEntry    — api/watchlist/route.ts
MacroEvent        — api/macro-events/route.ts
SessionData       — analysis/AnalysisDashboard.tsx
TradingPlan       — tradingplan/TradingPlanDashboard.tsx
ConditionEntry    — tradingplan/TradingPlanDashboard.tsx
```

Add when building:

```
VixSnapshot / Vix1dSnapshot / SessionSummary / WeeklyStraddleSnapshot
```

---

## Color Palette

```
#0a0a0a #111111 #1a1a1a #1f1f1f #222222 #2a2a2a  — backgrounds
#9ca3af #888 #666 #555 #444 #333                  — text
#9CA9FF straddle | #60a5fa skew | #737373 SPX dashed
#444 day separators | #4ade80 open/positive | #f87171 negative
#f59e0b amber/medium/hover | #4ade8066 upside 1σ | #f8717166 downside 1σ
```

## Timezone

UTC stored → CT displayed → ET for market hours gating → ET for date strings.
RTH open = 09:30 ET = 13:30 UTC during DST.

## Auth

`proxy.ts` not `middleware.ts`. `createSupabaseServerClient()` server-side.
Route protection: `const { data: { user } } = await supabase.auth.getUser(); if (!user) redirect("/login");`
