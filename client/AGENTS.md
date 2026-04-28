# Agents — Coding Conventions

Read `CLAUDE.md` first for project context.

---

## Golden Rules

1. **Hooks own data. Components own UI.** Never mix.
2. **Always ask for the current file before modifying** — Pedro tweaks between sessions.
3. **Never hardcode hex.** Add a token to `globals.css @theme` first.
4. **No state in render.** Time, randomness, DOM reads = `useEffect` only.

---

## Hydration — Non-Negotiable

Server HTML must equal initial client HTML. Never call `Date.now()`, `new Date()`, or `Math.random()` outside `useEffect`.

```tsx
const [now, setNow] = useState<Date | null>(null);
useEffect(() => {
  queueMicrotask(() => setNow(new Date()));   // queueMicrotask avoids React 19 cascade warning
  const t = setInterval(() => setNow(new Date()), 1000);
  return () => clearInterval(t);
}, []);

return now ? <span>{formatHMS("America/Chicago", now)} CT</span>
           : <span>--:--:-- CT</span>;
```

---

## Theme

### 1. Tailwind utilities (default — 90% of JSX)

```tsx
<div className="bg-page text-text-2 border-border hover:text-amber" />
```

### 2. Inline styles for static semantic colors

```tsx
import { THEME, withOpacity } from "../lib/theme";

<div style={{ color: THEME.up }} />
<div style={{ background: withOpacity(THEME.up, 0.4) }} />
// NEVER: `${THEME.up}66`  → invalid CSS
```

### 3. Inline styles for dynamic / conditional colors

```tsx
// raw var() string — identical SSR and client
<div style={{ color: condition ? "var(--color-up)" : "var(--color-down)" }} />

// cssVar() reads computed DOM — does not exist on server → hydration mismatch
<div style={{ color: cssVar("--color-up") }} />
```

### 4. ECharts / canvas — `resolveChartPalette()` inside `useEffect`

```tsx
useEffect(() => {
  const P = resolveChartPalette();
  chart.setOption({ backgroundColor: P.bg });
}, [...]);
```

### Adding a new token

1. Add `--color-newname: #hex;` to `globals.css @theme`.
2. Add `newname: "var(--color-newname)"` to `THEME` in `theme.ts`.
3. If used in canvas/ECharts: add to `resolveChartPalette()` in `chartPalette.ts`.
4. If alpha variant needed: `--color-newname-15: color-mix(in srgb, var(--color-newname) 15%, transparent)`.

---

## Font Sizes

| Role | Class |
|------|-------|
| Primary labels | `text-xs` (12px) |
| Values | `text-base` or `text-xl` |
| Sub-context | `text-[9px]` |
| Evidence / mono data | `text-[11px]` |
| Tiny indicators | `text-[8px]` |

All primary labels: `tracking-[0.05em]`.

---

## Layout

- Sections: `max-w-7xl mx-auto px-4 md:px-6`
- LiveTab wrapper: `max-w-7xl mx-auto px-4 md:px-6 py-3 space-y-3`
- Section boxes: `border border-border-2`, vertical separation via `space-y-3`
- Cell padding: `px-3 py-2` standard; `px-3 py-2.5` for instrument cards
- Fixed-height panels: PositionsSideBySide = 260px, CalendarFixedHeight = 260–400px

---

## Hook Structure

```typescript
"use client";
export function useXxxData(selectedDate: string, initialData: XxxSnapshot[] = []) {
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
    return () => { cancelled = true; };
  }, [selectedDate]);

  useEffect(() => {
    const today = new Date().toLocaleDateString("en-CA", {
      timeZone: "America/New_York",
    });
    const channel = supabase
      .channel("xxx_realtime")
      .on("postgres_changes",
          { event: "INSERT", schema: "public", table: "xxx_snapshots" },
          (payload) => {
            if (selectedDate === today)
              setData((prev) => [...prev, payload.new as XxxSnapshot]);
          })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [selectedDate]);

  return { data };
}
```

Rules:

- Always `cancelled` flag in fetch effects.
- Always `removeChannel(channel)` in realtime cleanup.
- `initialData` only when SSR-fetched in the page component.
- Realtime tables must have replication enabled in Supabase dashboard.

---

## Session Classification

```typescript
import {
  classifySessionFinal,
  computePriceCharacter,
  computeSkewCharacter,
  computeTags,
} from "../lib/sessionCharacter";

const type = classifySessionFinal(s.maxMovePct, s.realizedMovePct);
// → "Trend day" | "Trend with partial reversal" | "Reversal day" | "Flat day"

const tags = computeTags({ price, skew, minutesSinceOpen });
// TagContext = { price, skew, minutesSinceOpen } ONLY
```

`classifySessionFinal` uses magnitude ≥ 1.0 (post-session, historical consistency).
`computePriceCharacter` uses unified thresholds (no magnitude floor) for live classification.

---

## LiveReadPanel Rules

- Arrow (↑↓) only on `trending` — never on `partial_reversal` or `reversal`.
- `held` in evidence line = `magnitude × character` — never `character` alone.
- Synthesis only for trending/reversal with non-flat skew.
- Flat skew → no synthesis tag, ever.

---

## ECharts

### Standard setup

```typescript
/* eslint-disable @typescript-eslint/no-explicit-any */
import { resolveChartPalette } from "../lib/chartPalette";

useEffect(() => {
  const P = resolveChartPalette();
  chart.setOption({
    backgroundColor: P.bg,
    animation: false,
    series: [{
      type: "scatter",
      emphasis: {
        focus: "series",
        itemStyle: { opacity: 1, borderWidth: 1, borderColor: P.text2 },
      },
      blur: { itemStyle: { opacity: 0.12 } },   // ALWAYS on multi-series charts
    }],
  });
}, [data]);
```

### CT timezone on time axis (StraddleSpxChart pattern)

Pre-shift UTC → CT-equivalent UTC, then use `useUTC: true`.

```typescript
function toChartMs(utcMs: number): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
  }).formatToParts(new Date(utcMs));
  const p = Object.fromEntries(parts.map((x) => [x.type, x.value]));
  const hour = p.hour === "24" ? "00" : p.hour;
  return Date.UTC(+p.year, +p.month - 1, +p.day, +hour, +p.minute, +p.second);
}
// chart.setOption({ useUTC: true, ... })
// All timestamps must be pre-shifted via toChartMs().
// Keep a Map<shiftedMs, utcMs> if tooltips need to render real ET/local time.
```

### Category axis (SkewHistoryChart pattern)

- `xAxis: { type: "category", data: categories }` — eliminates overnight/weekend voids.
- Build `indexMapRef`: ordinal → UTC ms map.
- Session breaks (gap > 30 min) → null point + `connectNulls: false`.
- All formatters: `parseInt(value)` → `indexMap` lookup → CT format.

---

## Lightweight Charts (FlyMiniChart inside PositionsPanel — pending ECharts migration)

```typescript
timeScale: {
  tickMarkFormatter: (time: unknown) => {
    if (typeof time !== "number") return "";
    return new Date(time * 1000).toLocaleTimeString("en-US", {
      timeZone: "America/Chicago", hour: "2-digit", minute: "2-digit", hour12: false,
    });
  },
}
// Always dedup before setData: .filter((p, i, arr) => i === 0 || p.time > arr[i-1].time)
// Wrap removePriceLine, fitContent in try/catch
```

---

## Analysis Route Patterns

```typescript
// OVERNIGHT WINDOW (EDT = UTC-4):
const windowStart = new Date(`${prev}T20:00:00Z`).getTime();   // 16:00 ET prev day
const windowEnd   = new Date(`${date}T13:30:00Z`).getTime();    // 09:30 ET current day
// NEVER use T21:00:00Z — that skips the critical first hour after RTH close.

// ES BAR FILTER — always:
e.high !== null && e.low !== null && e.high > 0 && e.low > 0

// ROW CAP — Supabase max-rows = 15000. All large queries need .limit():
.limit(20000)   // straddle_snapshots
.limit(50000)   // es_snapshots

// SKEW: only valid >= 2026-04-02
// weekly_straddle_snapshots: needs anon + auth read RLS policies
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

// ATM strike: always DXFeed Quote mid — NEVER Summary.openPrice
// session_summary + trading_plans: always upsert onConflict: "date"
// ES symbol: getFrontMonthEsSymbol() in server/lib/futures.mjs — never hardcode
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

Inputs are now **manually entered** in PreMarketSection (the dealer pipeline that previously auto-derived `gamma_regime` / `balance_strikes` / `test_strikes` was removed).

```typescript
// gamma_regime:        "negative" → +2,  "positive" → -2,  "mixed" → 0
// skew_pctile:           >75 → +1,        <25 → -1
// vix1d_vix_ratio:       >1.1 → +1,       <0.9 → -1
// overnight_es_range:    "tight" → +1,    "wide" → -1
// balance_strikes present (non-empty)     → -1

// Bias bands:
// ≥+4   → TRENDING (high-conf)
// +2/+3 → TRENDING (low-conf)
// -1..+1→ UNCLEAR
// -2/-3 → REVERTING (low-conf)
// ≤-4   → REVERTING (high-conf)
```

---

## Types Reference

`client/app/types.ts`:
`StraddleSnapshot` · `EsSnapshot` · `SpxSnapshot` · `RtmSession` · `FlySnapshot` · `SkewSnapshot` · `ChartRange`

`TickData` (useLiveTick): `{ bid, ask, mid, prevClose, last, delta, gamma, theta, vega, iv, lastUpdateMs }`

(Dealer types removed alongside the pipeline.)

---

## Timezone Summary

| Context | Timezone |
|---------|----------|
| Stored | UTC |
| Displayed | CT (America/Chicago) |
| Market hours gating | ET (America/New_York) |
| Date strings (`en-CA`) | ET |
| ECharts time axis | CT via `toChartMs()` + `useUTC: true` |
| ECharts category axis | CT via `indexMapRef` + formatter |
| Lightweight Charts | CT via `tickMarkFormatter` |
| Overnight window | `prev T20:00:00Z` → `date T13:30:00Z` |
