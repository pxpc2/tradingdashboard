# Agents — Coding Conventions

Read CLAUDE.md first for full project context.

---

## The Golden Rule

**Hooks own data. Components own UI. Never mix.**

---

## CRITICAL: Always Ask for Current File First

Pedro makes visual tweaks between sessions. Never code on top of a file from an earlier message without confirming it's current.

---

## Hydration Rule — Non-Negotiable

Never compute time-varying values during SSR. Server HTML must equal initial client HTML.

```tsx
const [now, setNow] = useState<Date | null>(null);
useEffect(() => {
  queueMicrotask(() => setNow(new Date())); // queueMicrotask avoids React 19 cascade warning
  const t = setInterval(() => setNow(new Date()), 1000);
  return () => clearInterval(t);
}, []);

{
  now ? formatHMS("America/Chicago", now) + " CT" : "--:--:-- CT";
}
```

Never call `Date.now()`, `new Date()`, or `Math.random()` outside `useEffect`.

---

## Theme Rules

### 1. Tailwind utilities (default)

```tsx
<div className="bg-page text-text-2 border-border hover:text-amber">
```

### 2. Inline styles — static semantic colors

```tsx
import { THEME, withOpacity } from "../lib/theme";

<div style={{ color: THEME.up }} />
<div style={{ background: withOpacity(THEME.up, 0.4) }} />
// NEVER: `${THEME.up}66` → invalid CSS
```

### 3. Inline styles — dynamic/conditional colors

```tsx
// CORRECT — raw var() string, identical on server and client
<div style={{ color: condition ? "var(--color-gex-pos)" : "var(--color-gex-neg)" }} />

// WRONG — cssVar() reads computed DOM style, doesn't exist on server → hydration mismatch
<div style={{ color: cssVar("--color-gex-pos", "#7fc096") }} />
```

### 4. ECharts / canvas — resolveChartPalette() inside useEffect

```tsx
import { resolveChartPalette } from "../lib/chartPalette";
useEffect(() => {
  const P = resolveChartPalette();
  chart.setOption({ backgroundColor: P.bg });
}, [...]);
```

### Adding a new token

1. Add `--color-newname: #hex;` to `globals.css @theme`
2. Add `newname: "var(--color-newname)"` to `THEME` in `theme.ts`
3. If canvas: add to `resolveChartPalette()` in `chartPalette.ts`
4. If alpha variant: `--color-newname-15: color-mix(in srgb, var(--color-newname) 15%, transparent)`

---

## Font Size System

| Role                 | Class                    | Usage                          |
| -------------------- | ------------------------ | ------------------------------ |
| Primary labels       | `text-xs` (12px)         | Section headers, cell labels   |
| Values               | `text-base` or `text-xl` | Metric values, prices          |
| Sub-context          | `text-[9px]`             | MID, OPEN, %ILE, context lines |
| Evidence / mono data | `text-[11px]`            | Evidence line, dealer pills    |
| Tiny indicators      | `text-[8px]`             | Status dots                    |

All primary labels: `tracking-[0.05em]`.

---

## Layout Conventions

- All sections: `max-w-7xl mx-auto px-4 md:px-6`
- LiveTab wrapper: `max-w-7xl mx-auto px-4 md:px-6 py-3 space-y-3`
- Section boxes: `border border-border-2`, separated by `space-y-3`
- Cell padding: `px-3 py-2` standard, `px-3 py-2.5` for instrument cards
- Fixed-height panels: PositionsSideBySide = 260px, CalendarFixedHeight = 260px

---

## Session Classification — Always Shared

```typescript
import {
  classifySessionFinal,
  SESSION_TYPE_COLOR,
  resolveSessionTypeColors,
} from "../../lib/sessionCharacter";

const type = classifySessionFinal(s.maxMovePct, s.realizedMovePct);
// → "Trend day" | "Trend with partial reversal" | "Reversal day" | "Flat day"
```

Note: `classifySessionFinal` uses magnitude ≥ 1.0 for post-session type (historical consistency).
`computePriceCharacter` uses unified thresholds (no magnitude floor) for live classification.

---

## Live Tag System

```typescript
import { computeTags } from "../lib/sessionCharacter";
const tags = computeTags({ price, skew, minutesSinceOpen });
// TagContext = { price, skew, minutesSinceOpen } ONLY — nothing else
```

Tag vocabulary is fixed — see CLAUDE.md. Do not add codes without discussion.

---

## Narrative Rules — LiveReadPanel

- Arrow (↑↓) only on `trending` — never on `partial_reversal` or `reversal`
- `held` in evidence line = `magnitude × character` — never `character` alone
- Synthesis only for trending/reversal with non-flat skew direction
- Flat skew → no synthesis tag ever

---

## ECharts Patterns

### Standard setup

```typescript
/* eslint-disable @typescript-eslint/no-explicit-any */
import { resolveChartPalette } from "../../lib/chartPalette";

useEffect(() => {
  const P = resolveChartPalette();
  chart.setOption({
    backgroundColor: P.bg,
    animation: false,
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

### CT timezone on time axis (StraddleSpxChart pattern)

```typescript
// Pre-shift UTC → CT-equivalent UTC, then use useUTC: true
function toChartMs(utcMs: number): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(new Date(utcMs));
  const p = Object.fromEntries(parts.map((x) => [x.type, x.value]));
  const hour = p.hour === "24" ? "00" : p.hour;
  return Date.UTC(
    Number(p.year),
    Number(p.month) - 1,
    Number(p.day),
    Number(hour),
    Number(p.minute),
    Number(p.second),
  );
}
// chart.setOption({ useUTC: true, ... })
// All timestamps passed to ECharts must be pre-shifted via toChartMs()
```

### Category axis for multi-session charts (SkewHistoryChart pattern)

```typescript
// Build ordinal index → UTC ms map to avoid time-proportional voids
// null entries in indexMap = session breaks → null points in series → connectNulls: false
// xAxis: { type: "category", data: categories }
// axisLabel/axisPointer formatters: parseInt(value) → indexMap lookup → CT format
```

---

## Lightweight Charts (FlyMiniChart only — pending ECharts migration)

```typescript
// Always include CT formatters:
timeScale: {
  tickMarkFormatter: (time: unknown) => {
    if (typeof time !== "number") return "";
    return new Date(time * 1000).toLocaleTimeString("en-US", {
      timeZone: "America/Chicago", hour: "2-digit", minute: "2-digit", hour12: false,
    });
  },
},
// Always dedup: .filter((p, i, arr) => i === 0 || p.time > arr[i-1].time)
// Wrap removePriceLine, fitContent in try/catch
```

---

## Hook Structure

```typescript
"use client";
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
- `initialData` only on hooks SSR-fetched in `page.tsx`
- Realtime tables must have replication enabled in Supabase dashboard

---

## Dealer Patterns

### useDealerSnapshot

```typescript
useDealerSnapshot(date) → { gex: DealerStrikeSnapshot | null, cex: DealerStrikeSnapshot | null }
// Realtime sub on dealer_strike_snapshots — must have replication enabled
```

### Wall extraction (LiveTab)

```typescript
function extractTopWalls(strikes, spot, rangePt = 50, count = 3)
  → { positive: StrikeWall[], negative: StrikeWall[] }

// MetricsGrid: count=3 (topWalls)
// StraddleSpxChart: count=5 (chartWalls)
// StraddleSpxChart receives balanceWalls + testWalls props — NOT dealerGex
```

### MetricsGrid dual cell

```tsx
{ label: "OVERALL", dual: { gex: dealerTotal, cex: dealerCexTotal } }
// DualRow colors use raw var() strings — never cssVar()
// GEX: "var(--color-gex-pos)" / "var(--color-gex-neg)"
// CEX: "var(--color-cex-pos)" / "var(--color-cex-neg)"
// Backgrounds: "var(--color-gex-pos-15)" etc.
```

---

## PositionsPanel

```typescript
<PositionsPanel {...props} />                   // internal Real↔SML toggle
<PositionsPanel {...props} lockedView="real" /> // locked: no toggle
<PositionsPanel {...props} lockedView="sml" />  // locked: no toggle
```

---

## Analysis — Critical Patterns

```typescript
// OVERNIGHT WINDOW (EDT = UTC-4):
const windowStart = new Date(`${prev}T20:00:00Z`).getTime(); // 16:00 ET
const windowEnd = new Date(`${date}T13:30:00Z`).getTime(); // 09:30 ET
// NEVER use T21:00:00Z — that skips the critical first hour after RTH close

// ES BAR FILTER — always:
e.high !== null &&
  e.low !== null &&
  e.high > 0 &&
  e.low >
    (0)

      // ROW CAP — Supabase max-rows = 15000. All large queries need .limit(N):
      .limit(20000) // straddle_snapshots
      .limit(50000); // es_snapshots

// SKEW: only valid >= 2026-04-02
// WEEKLY STRADDLE: needs anon + auth read RLS policies
```

---

## Poller Conventions

```js
// WALL-CLOCK ANCHORING
function msUntilNextMinute() {
  return Math.ceil(Date.now() / 60000) * 60000 - Date.now();
}
function currentBarTime() {
  return new Date(Math.floor(Date.now() / 60000) * 60000).toISOString();
}

// ATM: always DXFeed Quote mid — NEVER Summary.openPrice
// session_summary + trading_plans: always upsert onConflict: "date"
// ES symbol: /ESM26:XCME (roll Sep 2026 → /ESU26:XCME)
// Dealer loop: reads spot from straddle_snapshots — 09:30 bar may skip (pending 90s delay fix)
```

---

## Real Positions

```typescript
// Filter: "Equity Option" | "Future Option" only
// OCC equity strike: parseInt(raw) / 1000
// Future option strike: parseFloat(raw) as-is
// P&L = sign * (mid - averageOpenPrice) * quantity * multiplier
// Trade grouping: 10s cluster, same underlying + expiry + optionType
// Greeks: tick.delta from DXFeed Greeks event (null for non-options)
// VIX/VIX1D: always tick.last
```

---

## Trading Plan Regime Scoring

```typescript
// gamma_regime: negative → +2, positive → -2, mixed → 0
// skewPctile: >75 → +1, <25 → -1
// vix1d_vix_ratio: >1.1 → +1, <0.9 → -1
// overnight_es_range: "tight" → +1, "wide" → -1
// balance_strikes present → -1
// ≥+4 TRENDING high-conf | +2/+3 low-conf | -1/+1 UNCLEAR | -2/-3 REVERTING low-conf | ≤-4 high-conf
```

---

## Types Reference

`client/app/types.ts`: `StraddleSnapshot` · `EsSnapshot` · `SpxSnapshot` · `RtmSession` · `FlySnapshot` · `SkewSnapshot` · `DealerStrikeRow` · `DealerMetric` · `DealerStrikeSnapshot` · `DealerTimelineBar` · `DealerTimelineSnapshot`

`TickData` (useLiveTick): `{ bid, ask, mid, prevClose, last, delta, gamma, theta, vega, iv, lastUpdateMs }`

`Wall` (inline): `{ strike: number, value: number }` — used by MetricsGrid, IntradayCharts, StraddleSpxChart

---

## Timezone Summary

| Context                | Timezone                              |
| ---------------------- | ------------------------------------- |
| Stored                 | UTC                                   |
| Displayed              | CT (America/Chicago)                  |
| Market hours gating    | ET (America/New_York)                 |
| Date strings (`en-CA`) | ET                                    |
| ECharts time axis      | CT via `toChartMs()` + `useUTC: true` |
| ECharts category axis  | CT via `indexMapRef` + formatter      |
| Lightweight Charts     | CT via `tickMarkFormatter`            |
| Overnight window       | `prev T20:00:00Z` → `date T13:30:00Z` |
