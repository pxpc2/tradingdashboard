# Agents — Coding Conventions

Read CLAUDE.md first for full project context.

---

## The Golden Rule

**Hooks own data. Components own UI. Never mix.**

Exceptions: `PositionsPanel.tsx` inline SML form, `TradingPlanDashboard.tsx` plan saves.

---

## CRITICAL: Always Ask for Current File First

Pedro makes visual tweaks between sessions. Never code on top of a file from an earlier message without confirming it's current.

---

## Hydration Rule — Non-Negotiable

**Never compute time-varying values during SSR.** Server HTML must equal initial client HTML.

```tsx
// CORRECT — null on server, populated after mount
const [now, setNow] = useState<Date | null>(null);
useEffect(() => {
  setNow(new Date());
  const t = setInterval(() => setNow(new Date()), 1000);
  return () => clearInterval(t);
}, []);

// Render placeholder until mounted:
{
  now ? formatHMS("America/Chicago", now) + " CT" : "--:--:-- CT";
}
```

Applies to: clocks, market status dots, any value that changes per-render.
Never call `Date.now()`, `new Date()`, or `Math.random()` outside `useEffect`.

---

## Theme Rules — Never Hardcode Hex

Single source of truth is `globals.css @theme`. Three paths to use a color:

### 1. Tailwind utilities (default for JSX)

```tsx
<div className="bg-page text-text-2 border-border hover:text-amber">
```

### 2. Inline styles — import from `lib/theme.ts`

```tsx
import { THEME, withOpacity } from "../lib/theme";

<div style={{ color: THEME.up }} />
// NEVER concat: `${THEME.up}66` → produces invalid 'var(--color-up)66'
<div style={{ background: withOpacity(THEME.up, 0.4) }} />
// → 'color-mix(in srgb, var(--color-up) 40%, transparent)'
```

### 3. Canvas / ECharts / Lightweight Charts — use `cssVar()` or `resolveChartPalette()`

```tsx
import { cssVar } from "../lib/theme";
import { resolveChartPalette } from "../lib/chartPalette";

useEffect(() => {
  const P = resolveChartPalette();
  chart.setOption({ backgroundColor: P.bg, ... });
}, [...]);
```

### Adding a new token

1. Add `--color-newname: #hex;` to `globals.css @theme`
2. Add `newname: "var(--color-newname)"` to `THEME` in `theme.ts`
3. If canvas use: add to `resolveChartPalette()` in `chartPalette.ts`

---

## Font Size System

Consistent across all grid sections — do not deviate:

| Role                 | Class                    | Usage                                                    |
| -------------------- | ------------------------ | -------------------------------------------------------- |
| Primary labels       | `text-xs` (12px)         | STRADDLE, CHARACTER, SKEW, section headers, tab labels   |
| Values               | `text-base` or `text-xl` | Metric values, instrument prices                         |
| State labels         | `text-sm` (14px)         | TRENDING UP, PARTIAL REVERSAL, STRONG in Character panel |
| Sub-context          | `text-[9px]`             | MID, OPEN, %ILE, 1D/30D under metric values              |
| Evidence / mono data | `text-[11px]`            | Evidence line in LiveReadPanel                           |
| Tiny indicators      | `text-[8px]`             | Status dots ●, impact squares ■                          |

All primary labels also use `tracking-[0.05em]` for consistency.

---

## Layout Conventions

**Padding**: all sections and the shell header/footer use `max-w-7xl mx-auto px-4 md:px-6`. Never omit padding on a new section — content must line up with the header.

**LiveTab wrapper**: `max-w-7xl mx-auto px-4 md:px-6 py-3 space-y-3`

**Section boxes**: each section uses `border border-border-2` (full outline). Sections separated by `space-y-3`. Never use `border-b` as a section separator when sections have gaps between them.

**Cell padding standard**: `px-3 py-2` for metric/character cells, `px-3 py-2.5` for instrument cards.

**Fixed-height panels**: PositionsSideBySide = 260px, CalendarFixedHeight = 260px.

---

## Session Classification — Always Shared

Never write local classification functions:

```typescript
import {
  classifySessionFinal,
  SESSION_TYPE_COLOR,
  SESSION_TYPE_ORDER,
  resolveSessionTypeColors,
} from "../../lib/sessionCharacter";

const type = classifySessionFinal(s.maxMovePct, s.realizedMovePct);
// Returns: "Trend day" | "Trend with partial reversal" | "Reversal day" | "Flat day"

// JSX:
<span style={{ color: SESSION_TYPE_COLOR[type] }}>{type}</span>

// Canvas:
useEffect(() => {
  const C = resolveSessionTypeColors();
  // use C[type] for series color
}, [...]);
```

---

## Live Tag System — computeTags()

Import from `lib/sessionCharacter.ts`. TagContext = `{ price, skew, minutesSinceOpen }` only — nothing else.

```typescript
import { computeTags, TagContext } from "../lib/sessionCharacter";

const tags = computeTags({
  price: priceChar,
  skew: skewChar,
  minutesSinceOpen,
});
```

Do not pass `hasMacro`, `putIv`, `callIv`, `atmIv`, or `vix1dVixRatio` — those are dropped from the tag system. The full tag vocabulary is fixed (documented in CLAUDE.md) — do not add new codes without discussion.

---

## Narrative Vocabulary — LiveReadPanel

The narrative is built from three fixed vocabularies: price phrases, skew phrases, synthesis. Do not invent new phrases. Full vocabulary in CLAUDE.md.

Key rules:

- Arrow (↑↓) shown only on `trending` price state — never on `partial_reversal` or `reversal`
- Evidence line `held` = `magnitude × character` (straddle units) — never `character` alone
- Synthesis fires only for trending and reversal states — never for partial_reversal, pinned, choppy

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

- Always `cancelled` flag in fetch effects
- Always clean up realtime channels
- `initialData` param only on hooks SSR-fetched in `page.tsx`

---

## Lightweight Charts Pattern

```typescript
import { cssVar } from "../lib/theme";

useEffect(() => {
  const panel = cssVar("--color-panel", "#121214");
  const border = cssVar("--color-border", "#1f1f21");
  const text5 = cssVar("--color-text-5", "#44433F");

  const chart = createChart(containerRef.current, {
    layout: { background: { color: panel }, textColor: text5 },
    grid: { vertLines: { visible: false }, horzLines: { color: border } },
    timeScale: {
      borderColor: border,
      timeVisible: true,
      secondsVisible: false,
      // ALWAYS add CT formatters — Supabase stores UTC, axis must show CT:
      tickMarkFormatter: (time: unknown) => {
        if (typeof time !== "number") return "";
        return new Date(time * 1000).toLocaleTimeString("en-US", {
          timeZone: "America/Chicago",
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        });
      },
    },
    localization: {
      timeFormatter: (time: unknown) => {
        if (typeof time !== "number") return "";
        const d = new Date(time * 1000);
        return (
          d.toLocaleDateString("en-US", {
            timeZone: "America/Chicago",
            month: "short",
            day: "numeric",
          }) +
          " " +
          d.toLocaleTimeString("en-US", {
            timeZone: "America/Chicago",
            hour12: false,
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          }) +
          " CT"
        );
      },
    },
  });
}, []);

// Always dedup points: .filter((p, i, arr) => i === 0 || p.time > arr[i-1].time)
// Wrap removePriceLine, fitContent in try/catch
```

### Price Line Refs

```typescript
const lineRef = useRef<IPriceLine | null>(null);
if (lineRef.current) { try { series.removePriceLine(lineRef.current); } catch {} lineRef.current = null; }
lineRef.current = series.createPriceLine({ ... });
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
    backgroundColor: P.bg,
    animation: false,
    tooltip: {
      backgroundColor: P.bg,
      borderColor: P.border2,
      textStyle: { color: P.text2 },
    },
    series: [
      {
        type: "scatter",
        emphasis: {
          focus: "series",
          itemStyle: { opacity: 1, borderWidth: 1, borderColor: P.text2 },
        },
        blur: { itemStyle: { opacity: 0.12 } }, // ALWAYS on multi-series charts
      },
    ],
  });
}, [data]);
```

---

## PositionsPanel — lockedView Prop

```typescript
// Two usage patterns:
<PositionsPanel {...props} />                  // legacy: internal Real↔SML toggle
<PositionsPanel {...props} lockedView="real" /> // locked: Real Positions, no toggle
<PositionsPanel {...props} lockedView="sml" />  // locked: SML Fly, no toggle

// PositionsSideBySide uses locked pattern:
<div className="grid grid-cols-2">
  <PositionsPanel {...props} lockedView="real" />
  <PositionsPanel {...props} lockedView="sml" />
</div>
```

---

## Real Positions

```typescript
// API: balancesAndPositionsService.getPositionsList(accountNumber)
// Filter: "Equity Option" | "Future Option" only
// OCC equity: "SPXW  260417C06820000" → strike = parseInt(raw) / 1000
// Future opt: "./ESM6 E2AJ6 260413P6750" → strike = parseFloat(raw) as-is
// multiplier from API (ES = 50, SPX = 100)

// Trade grouping: 10s cluster window, same underlying + expiry + optionType
// 1 leg → Naked | 2 legs opposite dirs equal qty → Vertical Spread
// 3 legs symmetric wings center=2× → Butterfly | else → Unknown (individual legs)

// P&L = sign * (mid - averageOpenPrice) * quantity * multiplier
// sign: Long = +1, Short = -1
// Greeks: tick.delta from DXFeed Greeks event (option symbols only — null for others)
```

---

## Trading Plan — Regime Scoring

```typescript
// gamma_regime: negative → +2, positive → -2, mixed → 0
// skewPctile: >75 → +1, <25 → -1, else 0
// vix1d_vix_ratio: >1.1 → +1, <0.9 → -1, else 0
// overnight_es_range: "tight" → +1, "wide" → -1, else 0
//   tight ON = trending RTH, wide ON = reverting RTH (validated Apr 13-17)
// balance_strikes present → -1, else 0
// ≥+4 → TRENDING (high-conf) | +2/+3 → TRENDING (low-conf)
// -1/+1 → UNCLEAR
// -2/-3 → REVERTING (low-conf) | ≤-4 → REVERTING (high-conf)
```

---

## Analysis Route — Critical Patterns

```typescript
// OVERNIGHT RANGE FILTER — always apply:
const valid = esSnapshots.filter(
  (e) => e.high !== null && e.low !== null && e.high > 0 && e.low > 0,
);
if (valid.length < 5) continue; // skip session if insufficient bars

// SKEW VALIDITY: only use skew_snapshots rows from >= 2026-04-02

// WEEKLY STRADDLE: needs BOTH RLS policies on weekly_straddle_snapshots:
// CREATE POLICY "anon read" ON weekly_straddle_snapshots FOR SELECT TO anon USING (true);
// CREATE POLICY "auth read" ON weekly_straddle_snapshots FOR SELECT TO authenticated USING (true);
```

---

## Poller Conventions

```js
// WALL-CLOCK ANCHORING — never fixed setTimeout(fn, 60000)
function msUntilNextMinute() {
  return Math.ceil(Date.now() / 60000) * 60000 - Date.now();
}
function currentBarTime() {
  return new Date(Math.floor(Date.now() / 60000) * 60000).toISOString();
}

// Open cycle: 09:30:15–09:30:45 ET
// ATM: always DXFeed Quote mid — NEVER Summary.openPrice
// FMP: observational log only — never used for decisions
// writeOpenSummary / writeCloseSummary: always fire-and-forget (.catch wrapped)
// session_summary + trading_plans: always upsert onConflict: "date"
// ES symbol: /ESM26:XCME (roll Sep 2026 → /ESU26:XCME)
```

---

## Types Reference

`client/app/types.ts`: `StraddleSnapshot` · `EsSnapshot` · `SpxSnapshot` · `RtmSession` · `FlySnapshot` · `SkewSnapshot`

From routes: `PositionLeg` (real-positions) · `WatchlistEntry` (watchlist) · `MacroEvent` (macro-events)

From components: `SessionData` (AnalysisDashboard) · `TradingPlan` + `ConditionEntry` (TradingPlanDashboard)

From lib: `SkewCharacter` · `PriceCharacter` · `SessionType` · `TagCode` · `Tag` · `TagContext` (sessionCharacter) · `ChartPalette` (chartPalette)

`TickData` (useLiveTick): `{ bid, ask, mid, prevClose, last, delta, gamma, theta, vega, iv }`
— Greeks null for non-option symbols. VIX/VIX1D always use `tick.last`.

---

## Timezone Summary

| Where                         | Timezone                 |
| ----------------------------- | ------------------------ |
| Stored (Supabase)             | UTC                      |
| Displayed (all UI)            | CT (America/Chicago)     |
| Market hours gating           | ET (America/New_York)    |
| Date strings (`en-CA` format) | ET (America/New_York)    |
| Chart x-axis                  | CT via tickMarkFormatter |
