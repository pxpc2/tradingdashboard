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

## Theme Rules — Never Hardcode Hex

Single source of truth is `globals.css @theme`. Three paths to use a color, depending on context:

### 1. Tailwind utilities (default for JSX)

```tsx
<div className="bg-page text-text-2 border-border hover:text-amber">
```

Every `--color-{name}` token auto-generates `bg-{name}`, `text-{name}`, `border-{name}`, etc.

### 2. Inline styles — import from `lib/theme.ts`

```tsx
import { THEME, withOpacity } from "../lib/theme";

<div style={{ color: THEME.up }} />
// THEME.up === 'var(--color-up)' — browser resolves at render

// Opacity variants
<div style={{ background: withOpacity(THEME.up, 0.4) }} />
// → 'color-mix(in srgb, var(--color-up) 40%, transparent)'
// NEVER concat like `${THEME.up}66` — produces invalid 'var(--color-up)66'
```

### 3. Canvas / ECharts / lightweight-charts — use `cssVar()` or `resolveChartPalette()`

```tsx
import { cssVar } from "../lib/theme";
import { resolveChartPalette } from "../lib/chartPalette";

useEffect(() => {
  const P = resolveChartPalette();  // { bg, border, text2, regime: {...}, up, down, amber, ... }
  chart.setOption({ backgroundColor: P.bg, ... });
}, [...]);

// Or for single-value needs:
const line = cssVar("--color-text-5", "#44433F");  // fallback for SSR safety
```

**Verifying theme wiring**: change `--color-up` in `globals.css` to `#ff00ff`, hard-refresh, confirm all up-colored UI turns magenta. Revert.

### Adding a new token

1. Add `--color-newname: #hex;` to `globals.css @theme`
2. Add `newname: "var(--color-newname)"` to `THEME` in `theme.ts`
3. If it'll be used in canvas, add to `resolveChartPalette()` in `chartPalette.ts`

---

## Session Classification — Always Shared

Never write local `classifySession` functions. Use the shared classifier:

```typescript
import {
  classifySessionFinal,
  SESSION_TYPE_COLOR,         // CSS var refs — JSX inline style use
  SESSION_TYPE_ORDER,
  resolveSessionTypeColors,   // resolved hex — canvas use
} from "../../lib/sessionCharacter";

// Classifier returns: "Trend day" | "Trend with partial reversal" | "Reversal day" | "Flat day"
const type = classifySessionFinal(s.maxMovePct, s.realizedMovePct);

// JSX coloring:
<span style={{ color: SESSION_TYPE_COLOR[type] }}>{type}</span>

// Canvas/ECharts:
useEffect(() => {
  const C = resolveSessionTypeColors();
  chart.setOption({
    series: [{ itemStyle: { color: C[type] }, ... }]
  });
}, [...]);
```

**Classification rules** (magnitude = maxPct/100, character = eod/max):

- magnitude < 0.3 → Flat day
- character ≥ 0.7 → Trend day (any magnitude)
- magnitude < 1.0 → Flat day (below implied + didn't hold)
- magnitude ≥ 1.0 AND character ≥ 0.4 → Trend with partial reversal
- magnitude ≥ 1.0 AND character < 0.4 → Reversal day

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

Rules:

- Always use `cancelled` flag in fetch effects
- Always clean up realtime channels
- `initialData` param only on hooks SSR-fetched in `page.tsx`

---

## Lightweight Charts Pattern

```typescript
import { cssVar } from "../lib/theme";

useEffect(() => {
  // Resolve colors at mount — canvas can't use CSS vars directly
  const panel = cssVar("--color-panel", "#121214");
  const border = cssVar("--color-border", "#1f1f21");
  const text5 = cssVar("--color-text-5", "#44433F");
  // ... etc

  const chart = createChart(containerRef.current, {
    layout: { background: { color: panel }, textColor: text5 },
    grid: { vertLines: { color: border }, horzLines: { color: border } },
    // ...
  });
}, []);

// Always dedup points: .filter((p, i, arr) => i === 0 || p.time > arr[i-1].time)
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
// Read strokeStyle via cssVar() at draw time
// ctx.strokeStyle = cssVar("--color-text-5", "#44433F")
// ctx.setLineDash([4,4])
// rightOffset: 80 on timeScale (skew chart)
```

---

## ECharts Pattern

```typescript
/* eslint-disable @typescript-eslint/no-explicit-any */
import { resolveChartPalette } from "../../lib/chartPalette";

useEffect(() => {
  if (!chartRef.current) return;
  const P = resolveChartPalette();

  chartRef.current.setOption({
    backgroundColor: P.bg,           // always P.bg, never hardcoded
    animation: false,
    legend: {
      textStyle: { color: P.text3, fontSize: 10 },
      inactiveColor: P.text6,        // dimmed legend entries when toggled off
    },
    xAxis: {
      axisLine: { lineStyle: { color: P.border } },
      axisLabel: { color: P.text3 },
      splitLine: { lineStyle: { color: P.border } },
    },
    // ... yAxis same pattern
    tooltip: {
      backgroundColor: P.bg,
      borderColor: P.border2,
      textStyle: { color: P.text2 },
    },
    series: [
      {
        type: "scatter",
        data: ...,
        itemStyle: { color: P.regime.trend, opacity: 0.85 },
        // LEGEND HOVER HIGHLIGHT — always add for multi-series charts:
        emphasis: {
          focus: "series",
          itemStyle: { opacity: 1, borderWidth: 1, borderColor: P.text2 },
        },
        blur: { itemStyle: { opacity: 0.12 } },
      },
    ],
  });
}, [data]);

// xAxis.type: "category" not "time" for RTH data (time shows overnight gaps)
// Only add legend entries for series that actually have data
// Two effects: creation (deps []) + data update (deps [data])
```

---

## LiveDashboard Patterns

```typescript
import { THEME } from "../lib/theme";
import {
  computeSkewCharacter,
  computePriceCharacter,
} from "../lib/sessionCharacter";

// useSearchParams() for ?date= param — needs Suspense in page.tsx
const today = searchParams.get("date") ??
  new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });

// VIX/VIX1D
const vixLast = ticks["VIX"]?.last ?? null;
const vix1dLast = ticks["VIX1D"]?.last ?? null;
const vixRatio = vix1dLast && vixLast && vixLast > 0
  ? (vix1dLast / vixLast).toFixed(2) : null;

// Up/down percentage coloring — via THEME refs
function pctColor(pct: string | null): string {
  if (!pct) return THEME.text3;
  return parseFloat(pct) >= 0 ? THEME.up : THEME.down;
}

// Skew percentile
const skewPctile = useMemo(() => {
  if (!latestSkew || skewHistory.length === 0) return null;
  return Math.round(
    skewHistory.filter(s => s.skew <= latestSkew.skew).length / skewHistory.length * 100
  );
}, [latestSkew, skewHistory]);

// Today's skew snapshots → skew character
const todaySkewRows = useMemo(() =>
  skewHistory.filter(s =>
    new Date(s.created_at).toLocaleDateString("en-CA", { timeZone: "America/New_York" }) === today
  ),
[skewHistory, today]);
const skewChar = useMemo(() => computeSkewCharacter(todaySkewRows), [todaySkewRows]);

// Price character — needs opening + current + max/min SPX across today's rows
const { maxSpx, minSpx } = useMemo(() => {
  if (todayRows.length === 0) return { maxSpx: null, minSpx: null };
  const prices = todayRows.map(r => r.spx_ref);
  if (liveSpx !== null) prices.push(liveSpx);
  return { maxSpx: Math.max(...prices), minSpx: Math.min(...prices) };
}, [todayRows, liveSpx]);
const priceChar = useMemo(() =>
  computePriceCharacter(opening?.spx_ref ?? null, liveSpx, maxSpx, minSpx, opening?.straddle_mid ?? null),
  [opening, liveSpx, maxSpx, minSpx]);

// Live read — render only during RTH
{spxOpen && <LiveReadLine price={priceChar} skew={skewChar} />}

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

// Direction color: Long → THEME.up (sage), Short → THEME.down (coral)
// P&L color: positive → THEME.up, negative → THEME.down
// Faded leg indicators: withOpacity(THEME.up, 0.4) / withOpacity(THEME.down, 0.4)
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
  // overnight_es_range: "tight" → +1, "wide" → -1, else 0
  //   ** tight ON = trending RTH, wide ON = reverting RTH (confirmed Apr 13-17) **
  // balance_strikes present → -1 (reverting), else 0
  // Total max ±6
  // ≥+4 → TRENDING (high-conf), +2/+3 → TRENDING (low-conf)
  // -1/+1 → UNCLEAR
  // -2/-3 → REVERTING (low-conf), ≤-4 → REVERTING (high-conf)
}
// computeScore() called on every savePlan() to keep regime_bias current
// Scoring is slated for redesign → magnitude + character forecasts
```

### Bias Colors (muted — live side)

```typescript
const BIAS_COLORS: Record<string, string> = {
  "TRENDING (high-conf)": THEME.amber,
  "TRENDING (low-conf)": withOpacity(THEME.amber, 0.6),
  UNCLEAR: THEME.text4,
  "REVERTING (low-conf)": withOpacity(THEME.indigo, 0.6),
  "REVERTING (high-conf)": THEME.indigo,
};
// amber = trending attention, indigo = reverting calm
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
  ts: string; // ISO — set at entry time, not editable
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
// Merge session_summary fields: openingVix, openingVix1d, vix1dVixRatio, hasMacro, spxClosedAboveOpen
```

### Overnight Range Filter — CRITICAL

```typescript
// ALWAYS filter before computing overnight range:
const overnightBars = esSnapshots.filter((e) => {
  const t = new Date(e.created_at).getTime();
  return (
    t >= windowStart &&
    t < windowEnd &&
    e.high !== null &&
    e.low !== null &&
    e.high > 0 &&
    e.low > 0
  ); // old rows have null OHLC — produces 6000pt "ranges" without this
});
if (overnightBars.length < 5) continue; // skip if not enough valid bars
```

### SessionData Type

```typescript
export type SessionData = {
  date: string;
  dayOfWeek: string;
  openingStraddle: number;
  openingSpx: number;
  openingSkew: number | null;
  closingSkew: number | null;
  skewChange: number | null;
  closingSpx: number;
  realizedMovePts: number;
  realizedMovePct: number;
  maxMovePts: number;
  maxMovePct: number;
  overnightRange: number | null;
  overnightGap: number | null;
  snapshots: StraddleSnapshot[];
  openingVix: number | null;
  openingVix1d: number | null;
  vix1dVixRatio: number | null;
  hasMacro: boolean | null;
  spxClosedAboveOpen: boolean | null;
};
```

### SkewVsRealized — Skew Direction Zones

```typescript
const SKEW_THRESHOLD = 0.005;
// X zones (jittered within):
//   Fell: skewChange < -0.005  → x ~ -1
//   Flat: Math.abs(skewChange) <= 0.005  → x ~ 0
//   Rose: skewChange > 0.005  → x ~ +1
// Y axis: EOD/max retention = (realizedMovePct / maxMovePct) * 100
// Color by session type via resolveSessionTypeColors()
// Dots classified by classifySessionFinal — NEVER a local threshold function
```

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

// Open cycle timing: 09:30:15 - 09:30:45 ET
// ATM selection: always from dxQuoteMid (not Summary.openPrice)
// FMP: observational log only, never used for decisions

// VIX/VIX1D in session_summary:
//   Read first bar from vix_snapshots / vix1d_snapshots after 90s delay (OHLC loop writes)
//   Never use getIndexLast() for session_summary — uses bar data instead

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
/* animation: ticker 120s linear infinite */
/* :hover → animation-play-state: paused */
/* maskImage edge fade */
/* Price: mid === 0 || mid === null ? last : mid */
/* Pct color: >= 0 → THEME.up, else THEME.down */
/* Border: open → THEME.status.open, closed → THEME.status.closed */
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
SkewCharacter  — lib/sessionCharacter.ts
PriceCharacter — lib/sessionCharacter.ts
SessionType    — lib/sessionCharacter.ts (4 post-session types)
ChartPalette   — lib/chartPalette.ts
```

TickData (useLiveTick.ts):

```typescript
{
  (bid, ask, mid, prevClose, last, delta, gamma, theta, vega, iv);
}
// delta/gamma/theta/vega/iv: null for non-option symbols
```

---

## Timezone

UTC stored → CT displayed → ET for market hours gating → ET for date strings.
RTH open = 09:30 ET = 13:30 UTC during EDT.

## Auth

`proxy.ts` not `middleware.ts`. `createSupabaseServerClient()` in server components.
Route protection: `const { data: { user } } = await supabase.auth.getUser(); if (!user) redirect("/login");`
