# Agents — Coding Conventions

Read CLAUDE.md first for full project context.

---

## The Golden Rule

**Hooks own data. Components own UI. Never mix.**

Exceptions: `PositionsPanel.tsx` inline SML form, `TradingPlanDashboard.tsx` plan saves.

---

## CRITICAL: Always Ask for Current File First

Pedro makes visual tweaks between sessions. Never code on top of a file from earlier without confirming it's current.

---

## Hook Structure

```typescript
"use client";
import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";

export function useXxxData(selectedDate: string, initialData: XxxSnapshot[] = []) {
  const [data, setData] = useState<XxxSnapshot[]>(initialData);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const { data } = await supabase
        .from("xxx_snapshots").select("*")
        .gte("created_at", `${selectedDate}T00:00:00`)
        .lt("created_at", `${selectedDate}T23:59:59`)
        .order("created_at", { ascending: true });
      if (!cancelled && data) setData(data);
    }
    load();
    return () => { cancelled = true; };
  }, [selectedDate]);

  useEffect(() => {
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
    const channel = supabase.channel("xxx_realtime")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "xxx_snapshots" },
        (payload) => { if (selectedDate === today) setData(prev => [...prev, payload.new as XxxSnapshot]); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [selectedDate]);

  return { data };
}
```

Rules:
- Always use `cancelled` flag in fetch effects
- Always clean up realtime channels
- `initialData` param only on hooks SSR-fetched in `page.tsx`

---

## Lightweight Charts Pattern

```typescript
// Effect 1 — creation (deps [])
// Effect 2 — data update (deps [data])
// Always dedup: .filter((p, i, arr) => i === 0 || p.time > arr[i-1].time)
// shiftVisibleRangeOnNewBar: false on timeScale
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
// Only add legend entries for series that actually have data
// Two effects: creation (deps []) + data update (deps [data])
```

---

## LiveDashboard Patterns

```typescript
// useSearchParams() for ?date= param — needs Suspense in page.tsx
const today = searchParams.get("date") ??
  new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });

// VIX/VIX1D
const vixLast = ticks["VIX"]?.last ?? null;
const vix1dLast = ticks["VIX1D"]?.last ?? null;
const vixRatio = vix1dLast && vixLast && vixLast > 0
  ? (vix1dLast / vixLast).toFixed(2) : null;
// Ratio amber when >= 1

// Skew percentile
const skewPctile = useMemo(() => {
  if (!latestSkew || skewHistory.length === 0) return null;
  return Math.round(
    skewHistory.filter(s => s.skew <= latestSkew.skew).length / skewHistory.length * 100
  );
}, [latestSkew, skewHistory]);

// Opening skew for 1σ levels
const openingSkew = useMemo(() =>
  skewHistory.find(s =>
    new Date(s.created_at).toLocaleDateString("en-CA", { timeZone: "America/New_York" }) === today
  ) ?? null,
[skewHistory, today]);

// Real positions — streamer symbols added to useLiveTick
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
// multiplier from API (ES = 50, SPX = 100)
```

### Trade Grouping (PositionsPanel)
```typescript
// 1. Sort legs by createdAt
// 2. Cluster: timeDiff <= 10000ms AND same underlying + expiry + optionType
// 3. Classify:
//    1 leg → Naked
//    2 legs, opposite dirs, equal qty → Vertical Spread
//    3 legs, symmetric wings, center qty = 2× wing → Butterfly
//    else → Unknown (show individually, never guess)
// P&L = sign * (mid - averageOpenPrice) * quantity * multiplier
// sign: Long = +1, Short = -1
```

### Max P&L (Vertical Spread)
```typescript
// Net debit = long leg averageOpenPrice - short leg averageOpenPrice
// Max loss = netDebit * qty * multiplier  (if debit spread)
// Max profit = (width - netDebit) * qty * multiplier
// % of max = currentPnl / maxProfit (or maxLoss)
```

### Greeks (PositionsPanel)
```typescript
// DXFeed Greeks event fires for option streamer symbols only
// tick.delta — per leg delta from DXFeed vol surface
// netDelta = sum of (sign * tick.delta * leg.quantity) across all legs
// sign: Long = +1, Short = -1
// Greeks are null for non-option symbols — always check for null
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
  // balance_strikes present → -1 (reverting), else 0
  // Total max ±6
  // ≥+4 → TRENDING (high-conf), +2/+3 → TRENDING (low-conf)
  // -1/+1 → UNCLEAR
  // -2/-3 → REVERTING (low-conf), ≤-4 → REVERTING (high-conf)
}
// computeScore() called on every savePlan() to keep regime_bias current
```

### Skew Trend (computeSkewTrend)
```typescript
// Groups recentSkewRows by ET date, takes last value per day (closing skew)
// Uses last 3 completed past sessions
// direction: expanding | compressing | flat (threshold ±0.005)
// skewAtmRatio = latestSkew.skew / latestSkew.atm_iv
// skewAtmRatioAvg = rolling avg of ratio from recent rows
```

### Condition Log Entry
```typescript
type ConditionEntry = {
  ts: string;  // ISO — set at entry time, not editable
  type: "CONFIRM" | "REGIME_BREAK" | "TRADE" | "NOTE";
  note: string;
};
```

### Closing Skew (PostSessionReview)
```typescript
// User inputs closing skew value
// Auto-computes skew_direction: rose | flat | fell (threshold ±0.005)
// Saved to trading_plans.closing_skew + trading_plans.skew_direction
```

### Saves
```typescript
supabase.from("trading_plans").upsert(payload, { onConflict: "date" });
// closing_skew auto-computes skew_direction on save if not already set
```

---

## Analysis Route

### Session Grouping
```typescript
// Group straddle_snapshots by ET date
// Skip sessions with < 2 snapshots or straddle_mid <= 0
// opening = first snapshot, closing = last snapshot
// skewChange = closingSkew - openingSkew (null if either missing)
// overnightRange: filter es_snapshots with valid OHLC (see below)
```

### Overnight Range Filter — CRITICAL
```typescript
// ALWAYS filter before computing overnight range:
const overnightBars = esSnapshots.filter(e => {
  const t = new Date(e.created_at).getTime();
  return t >= windowStart && t < windowEnd &&
    e.high !== null && e.low !== null &&
    e.high > 0 && e.low > 0;  // old rows have null OHLC — produces 6000pt "ranges" without this
});
if (overnightBars.length < 5) continue; // skip if not enough valid bars
```

### SessionData Type
```typescript
export type SessionData = {
  date: string; dayOfWeek: string;
  openingStraddle: number; openingSpx: number;
  openingSkew: number | null; closingSkew: number | null; skewChange: number | null;
  closingSpx: number; realizedMovePts: number; realizedMovePct: number;
  maxMovePts: number; maxMovePct: number;
  overnightRange: number | null; overnightGap: number | null;
  snapshots: StraddleSnapshot[];
};
```

### SkewVsRealized — Threshold Zones
```typescript
const SKEW_THRESHOLD = 0.005;
// Fell: skewChange < -0.005
// Flat: Math.abs(skewChange) <= 0.005
// Rose: skewChange > 0.005
// Y axis: EOD/max retention = (realizedMovePct / maxMovePct) * 100
// Dots jittered within zones to avoid overlap
```

---

## Poller Conventions

```js
// Wall-clock anchoring
function msUntilNextMinute() { return Math.ceil(Date.now() / 60000) * 60000 - Date.now(); }
function currentBarTime() { return new Date(Math.floor(Date.now() / 60000) * 60000).toISOString(); }

// Open cycle timing: 09:30:15 - 09:30:45 ET
// ATM selection: always from dxQuoteMid (not Summary.openPrice)
// FMP: observational log only, never used for decisions

// getIndexLast(symbol):
//   Primary: Trade event
//   Fallback after 8s: Summary.prevDayClosePrice
//   Total timeout: 20s

// writeOpenSummary: fire-and-forget
// writeCloseSummary: fire-and-forget + backfills opening_skew from first skew snapshot

// collectOhlc(quoteSymbols, tradeSymbols, ms)
//   quoteSymbols → Quote bid/ask mid (ES, SPX)
//   tradeSymbols → Trade last price (VIX, VIX1D)
```

---

## WatchlistStrip
```css
/* Items rendered twice: [...entries, ...entries] */
/* animation: ticker 80s linear infinite */
/* :hover → animation-play-state: paused */
/* maskImage edge fade */
/* Price: mid === 0 || mid === null ? last : mid */
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

From routes/components:
```
PositionLeg    — api/real-positions/route.ts (includes createdAt)
WatchlistEntry — api/watchlist/route.ts
MacroEvent     — api/macro-events/route.ts
SessionData    — analysis/AnalysisDashboard.tsx
TradingPlan    — tradingplan/TradingPlanDashboard.tsx
ConditionEntry — tradingplan/TradingPlanDashboard.tsx
SkewTrend      — tradingplan/TradingPlanDashboard.tsx
```

TickData (useLiveTick.ts):
```typescript
{ bid, ask, mid, prevClose, last, delta, gamma, theta, vega, iv }
// delta/gamma/theta/vega/iv: null for non-option symbols
```

---

## Color Palette
```
Backgrounds:  #0a0a0a #111111 #1a1a1a #1f1f1f #222222 #2a2a2a
Text:         #9ca3af #888 #666 #555 #444 #333
Chart:        #9CA9FF straddle/blue | #60a5fa skew | #737373 SPX dashed
              #444 day separators
              #4ade80 positive/long/open | #f87171 negative/short/high-ratio
              #f59e0b amber/medium/hover
              #4ade8066 upside 1σ | #f8717166 downside 1σ
```

## Timezone
UTC stored → CT displayed → ET for market hours gating → ET for date strings.
RTH open = 09:30 ET = 13:30 UTC during EDT.

## Auth
`proxy.ts` not `middleware.ts`. `createSupabaseServerClient()` in server components.
Route protection: `const { data: { user } } = await supabase.auth.getUser(); if (!user) redirect("/login");`
