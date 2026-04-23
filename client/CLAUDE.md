# Vovonacci Dashboard

Personal SPX options monitoring dashboard. Real-time data from Tastytrade/DXFeed, stored in Supabase, displayed in Next.js.

---

## Stack

- **Poller**: Node.js (`server/poller.mjs`) on Railway
- **Database**: Supabase (PostgreSQL + Realtime)
- **Frontend**: Next.js (`client/`) with Tailwind 4, ECharts (primary), Lightweight Charts v5 (FlyMiniChart only — pending migration), TypeScript
- **Auth**: Supabase Auth (email/password, single user), session via `@supabase/ssr` cookies
- **Data sources**: Tastytrade API (OAuth2), DXFeed/DXLink WebSocket streaming, QuantedOptions REST API
- **Fonts**: IBM Plex Sans (labels/UI) + IBM Plex Mono (numbers/values) via `next/font/google`
- **Brand**: "vovonacci·TERMINAL", Bloomberg-inspired muted palette, dense terminal aesthetic

---

## Project Structure

```
server/
  poller.mjs              # Entry point — startup, signal handlers
  lib/
    clients.mjs           # Supabase + Tastytrade client singletons
    market-hours.mjs      # isMarketHours, isGlobexHours, msUntilNextMinute, currentBarTime
    dxfeed.mjs            # getQuotes, getSpxOpenPrice, getSpxQuoteMid, getEsMid,
                          # getIndexLast, collectOhlc, withTimeout
    bsm.mjs               # BSM pricing, IV inversion, delta/strike finding
  loops/
    main.mjs              # Straddle, skew, SML fly, session_summary, weekly straddle
    ohlc.mjs              # ES+SPX+VIX+VIX1D OHLC — wall-clock anchored
    dealer.mjs            # QuantedOptions GEX+CEX — wall-clock anchored, 5min RTH

client/app/
  (dashboard)/            # Route group — shared shell: TopHeader/TabNav/Ticker/Footer
    layout.tsx            # SSR auth + shell
    live/page.tsx         # LIVE tab — SSR initial data → LiveTab
    positions/page.tsx    # POSITIONS tab (stub)
    chart/page.tsx        # CHART tab (stub)
    macro/page.tsx        # MACRO tab (stub)
  page.tsx                # redirect("/live")
  globals.css             # Tailwind 4 @theme — canonical color tokens
  types.ts                # ALL shared types — never redeclare locally
  lib/
    supabase.ts / supabase-server.ts / supabase-middleware.ts
    theme.ts              # THEME constants + cssVar() + withOpacity()
    chartPalette.ts       # resolveChartPalette() — hex values for ECharts
    sessionCharacter.ts   # computeSkewCharacter, computePriceCharacter,
                          # classifySessionFinal, computeTags,
                          # SESSION_TYPE_COLOR, resolveSessionTypeColors,
                          # SKEW_STRENGTH_COLOR
  analysis/
    page.tsx              # Auth-protected SSR
    AnalysisDashboard.tsx
    components/           # ImpliedVsRealized, RatioHistogram, DecayCurve,
                          # StraddleHistory, DayOfWeekBreakdown, MaxVsEod,
                          # SkewVsRealized, OvernightRange, VixVsRealized, WeeklyStraddle
  tradingplan/
    page.tsx / TradingPlanDashboard.tsx / components/
  hooks/
    useStraddleData.ts / useFlyData.ts / useSkewHistory.ts
    useEsData.ts / useLiveTick.ts / useWatchlist.ts
    useMacroEvents.ts / useRealPositions.ts / useDealerSnapshot.ts
  components/
    TopHeader.tsx           # Brand + 4 timezones + SPX tick-age latency + CT clock
    TabNav.tsx              # LIVE/POSITIONS/CHART/MACRO tabs
    SecondaryTicker.tsx     # Watchlist strip, SPX+ES auto-injected
    MarketStatusFooter.tsx  # NYSE/CBOE/GLBX open/closed dots
    LiveTab.tsx             # LIVE tab orchestrator
    LiveReadPanel.tsx       # Narrative + pills + evidence line
    InstrumentCards.tsx     # 4-up SPX/ES/VIX/VIX1D
    MetricsGrid.tsx         # 5×2 dealer+vol metrics grid
    IntradayCharts.tsx      # StraddleSpx (left) + SkewHistory (right)
    PositionsSideBySide.tsx # Real Positions (left) + SML Fly (right)
    CalendarFixedHeight.tsx # Macro calendar, 260px
    PositionsPanel.tsx      # Real positions + SML Fly + FlyMiniChart (Lightweight Charts)
    StraddleSpxChart.tsx    # ECharts — Straddle + SPX + 1σ + GEX wall markLines
    SkewHistoryChart.tsx    # ECharts — multi-session skew, category axis, day separators
    Converter.tsx           # ES/SPX basis — live via useLiveTick
  api/
    quotes / chain / pdhl / dxfeed-token / macro-events / watchlist / real-positions
```

---

## Theme System

**Single source of truth: `globals.css @theme`.**

| Layer                                         | Usage                                     |
| --------------------------------------------- | ----------------------------------------- |
| Tailwind utilities (`bg-page`, `text-text-2`) | 90% of JSX                                |
| `THEME.xxx` from `lib/theme.ts`               | Inline styles with static semantic colors |
| `resolveChartPalette()`                       | ECharts/canvas inside `useEffect` only    |

**Never hardcode hex.** Add tokens to `globals.css @theme` first.

**Opacity**: `withOpacity(THEME.up, 0.4)` → `color-mix(...)`. Never `${THEME.up}66`.

**SSR safety**: never call `cssVar()` in render — use raw `"var(--color-name)"` strings. `cssVar()` reads computed DOM style → doesn't exist on server → hydration mismatch.

### Palette

**Foundation**: `page #0a0a0a` · `panel #121214` · `panel-2 #17171a` · `border #1f1f21` · `border-2 #2a2a2d`

**Text**: `text #e8e6e0` → `text-2` → `text-3` → `text-4` → `text-5` → `text-6 #2f2e2c`

**Semantic**: `up #7fc096` · `down #d0695e` · `amber #f5a524` · `indigo #7ea8c4`

**Regime**: `regime-trend #e55a3f` · `regime-partial #e6b84f` · `regime-reversal #5bb4a0` · `regime-flat #707070`

**Skew**: `skew-flat #9a9890` · `skew-moving #9b7bb3` · `skew-strong #f5a524`

**SML fly widths**: 10→purple · 15→indigo · 20→amber · 25→teal · 30→coral

**Dealer colors** (added Apr 22 2026):

- `gex-pos: var(--color-up)` · `gex-neg: var(--color-down)`
- `gex-pos-15` / `gex-neg-15` — 15% alpha via `color-mix`
- `cex-pos: #4A9EFF` (blue = BEARISH charm) · `cex-neg: #E5A04A` (amber = BULLISH charm)
- `cex-pos-15` / `cex-neg-15`
- `wall-balance: #4A9EFF` · `wall-test: #E5A04A`

**CEX sign convention**: positive CEX = dealers selling = BEARISH = blue. Negative CEX = dealers buying = BULLISH = amber. Never invert.

---

## Supabase Tables

```
straddle_snapshots   id, created_at, spx_ref, atm_strike, call_bid, call_ask,
                     put_bid, put_ask, straddle_mid, es_basis (open cycle only)

rtm_sessions         id, created_at, sml_ref, sal_ref, widths (int[]), type
sml_fly_snapshots    id, created_at, session_id, width, mid, bid, ask

skew_snapshots       id, created_at, skew, put_iv, call_iv, atm_iv,
                     expiration_date, put_strike, call_strike
                     -- Only >= 2026-04-02 valid
                     -- skew = (put_iv - call_iv) / atm_iv

es_snapshots         id, created_at, bar_time, es_ref, open, high, low
                     -- ~1380 rows/day (full Globex). Filter: high/low not null and > 0
spx_snapshots / vix_snapshots / vix1d_snapshots

weekly_straddle_snapshots   -- Monday open cycle only. Needs anon+auth RLS read policies.

session_summary      id, date (unique), opening_*, closing_*, realized_*, max_intraday_*,
                     has_high_impact_macro, day_of_week, spx_closed_above_open, skew_direction
                     -- PENDING: add overnight_range_pts, skew_change, move metrics
                     --          to avoid recomputing in analysis page

trading_plans        id, date (unique), skew_value, skew_pctile, vix1d_vix_ratio,
                     gamma_regime, balance_strikes, test_strikes, overnight_es_range,
                     regime_score, regime_bias, score_breakdown (jsonb),
                     condition_log (jsonb[]), actual_regime, bias_was_correct,
                     closing_skew, skew_direction, lesson, accuracy_rating

dealer_strike_snapshots   id, created_at, date (ET), bar_time (HH:MM ET), metric (gex|cex),
                          total, strikes (jsonb), spot_ref, local_total (±15pt),
                          top_pos_strike, top_pos_value, top_neg_strike, top_neg_value
                          -- strikes = [[strike, val, call_val, put_val, call_mid, put_mid], ...]
                          -- Realtime MUST be enabled. RLS: anon+auth read, service insert

dealer_timeline_snapshots id, created_at, date (unique), data (jsonb),
                          open_gex, close_gex, min_gex, max_gex, regime_open
                          -- Written once at EOD. Historical data from 2026-04-16 only.
                          -- regime_open: "pos"|"neg"|"neutral" (±100M threshold)
```

**Supabase row cap**: max-rows = **15000** project-wide. `es_snapshots` hits this in ~10 days. All large-table analysis queries need explicit `.limit(N)`. Pending: `fetchAll()` pagination helper.

---

## Dealer Pipeline (QuantedOptions — LIVE)

- API: `https://www.quantedoptions.com/api/v1?key=...`
- 5k credits/month, 2 req/s. `/strikes` = 1 credit. `/timeline` = 1 credit.
- SPX MM 0DTE only. GEX + CEX. Every 5min RTH.
- Historical data available from **2026-04-16** only.

**CEX units**: per-trading-day dollar notional. Divide by 78 → per-5min.
`ES_contracts_per_5min = (local_CEX / 78) / (spot × 50)`
Calibrated vs VS3D Apr 22: QO -$166M/78 ≈ $2.13M ≈ VS3D $2.53M ✓

**Known issues / pending**:

- 09:30 first bar skipped (dealer fires before straddle writes spot) → fix: 90s open-cycle delay
- Watchdog reconnect spam after close → fix: gate on `isGlobexHours()`

---

## MetricsGrid (5×2)

```
Row 1: STRADDLE | IMPLIED | REALIZED | OVERALL | SPOT · ±15PT
Row 2: IV30     | SKEW    | VOL RATIO | BALANCE STRIKES | TEST STRIKES
```

OVERALL + SPOT use `dual` rendering: GEX row (green/red pill) + CEX row (blue/amber pill).
SPOT bottom label: BULLISH CHARM (amber) or BEARISH CHARM (blue) from local CEX sign.
BALANCE/TEST: top-3 walls stacked, colored `var(--color-wall-balance/test)`.

---

## StraddleSpxChart (ECharts)

- `useUTC: true` + `toChartMs()` pre-shift → x-axis renders as CT
- `utcLookupRef`: shifted ms → UTC ms, for CT/ET/local tooltip
- GEX walls: up to 5 balance + 5 test markLines, opacity-ranked, `insideStart` labels
- 1σ levels from openingSkew, dashed markLines from opening spx_ref
- Live SPX tick only during `isRTH()` — no post-close diagonal
- SPX current price: transparent markLine + `position: "start"` pill label (left axis)
- Straddle: filled pill `endLabel` (right axis)
- Props: `balanceWalls: Wall[]` + `testWalls: Wall[]` (not dealerGex)

---

## SkewHistoryChart (ECharts)

- `type: "category"` x-axis — eliminates overnight/weekend voids
- `indexMapRef`: ordinal index → UTC ms for all formatters
- Session breaks (gap > 30min) → null point → `connectNulls: false`
- Day separators: vertical markLines at session-start indices
- `dataZoom`: inside (scroll=zoom, drag=pan) + slider

---

## Session Character Framework

### Price classification (`computePriceCharacter`)

Unified thresholds — no magnitude requirement for reversal/partial:

| Classification     | Condition         |
| ------------------ | ----------------- |
| `insufficient`     | Missing data      |
| `flat`             | magnitude < 0.3   |
| `trending`         | character ≥ 0.7   |
| `partial_reversal` | character 0.4–0.7 |
| `reversal`         | character < 0.4   |

- **magnitude** = `maxMove / openingStraddle`
- **character** = `|currentMove| / maxMove`
- **held** (evidence line) = `magnitude × character`

### Skew classification (`computeSkewCharacter`)

- `flat`: maxExcursion < 0.008 · `moving`: 0.008–0.015 · `strongly_moving`: ≥ 0.015
- Direction: netChange > +0.003 → rising, < -0.003 → falling

### Post-session (`classifySessionFinal`)

Still uses magnitude ≥ 1.0 threshold for historical consistency.
Returns: `"Trend day"` · `"Trend with partial reversal"` · `"Reversal day"` · `"Flat day"`

---

## LIVE READ Panel

### Narrative vocabulary (fixed — do not add without discussion)

**Price**: `AWAITING DATA` · `PRICE PINNED` · `TREND DAY ↑/↓` · `PARTIAL REVERSAL DAY` · `CHOPPY DAY`

**Skew**: `FLAT SKEW` · `SKEW RISING` · `SKEW FALLING` · `SKEW RISING STRONG` · `SKEW FALLING STRONG`

**Synthesis** (only for trending/reversal with non-flat skew):

- price up + skew falling → `SKEW CONFIRMING`
- price up + skew rising → `SKEW DIVERGING`
- price down + skew rising → `SKEW CONFIRMING`
- price down + skew falling → `SKEW DIVERGING`
- Reversal: mirror of above
- Flat skew → no synthesis. partial_reversal/flat → no synthesis.

### Tag pills (`computeTags`)

| Code                   | Fires when                    | Color           |
| ---------------------- | ----------------------------- | --------------- |
| `CONFIRMED-TREND`      | trending + skew active        | price direction |
| `UNCONFIRMED-TREND`    | trending + skew flat          | amber           |
| `CONFIRMED-REVERSAL`   | reversal + skew flat          | indigo          |
| `UNCONFIRMED-REVERSAL` | reversal + skew active        | amber           |
| `FLAT-DAY`             | flat + mag < 0.3 + char < 0.3 | indigo          |
| `SKEW-RISING`          | strongly_moving + rising      | amber           |
| `SKEW-FALLING`         | strongly_moving + falling     | indigo          |
| `RV<IV`                | ≥ 2h + flat + mag < 0.5       | indigo          |

TagContext = `{ price, skew, minutesSinceOpen }` only.

---

## Poller Architecture

**Wall-clock anchoring**: always `msUntilNextMinute()` — never `setTimeout(fn, 60000)`.

**Open cycle** (09:30:15–09:30:45 ET): DXFeed Quote mid → straddle + `writeOpenSummary()`

**Close cycle** (16:00–16:01 ET): `writeCloseSummary()`

**Dealer loop**: 5min RTH, reads spot from `straddle_snapshots`. EOD `/timeline` call.

**ES symbol**: `/ESM26:XCME` — roll Sep 2026 → `/ESU26:XCME`

**ATM**: always DXFeed Quote mid — never Summary.openPrice

---

## Analysis Route

Auth-protected SSR. ECharts for all charts.

**Overnight range window** (EDT = UTC−4): `prev T20:00:00Z` → `date T13:30:00Z`
Always filter ES bars: `high !== null && low !== null && high > 0 && low > 0`

**Row cap**: Supabase max-rows = 15000. All large queries need `.limit(N)`.
Pending: `fetchAll()` paginator + materialize derived metrics into `session_summary`.

---

## Trading Plan Route

Auth-protected SSR. URL-only access (no nav link).

**Regime scoring (±6)**: gamma regime (±2) · skew pctile (±1) · VIX1D/VIX (±1) · overnight range (±1) · balance at price (±1)

---

## Key Conventions

- **Always ask for current file before modifying**
- **Timezones**: stored UTC · displayed CT · gating ET · date strings ET (`en-CA`)
- **Hooks own data, components own UI**
- **Hydration**: null on SSR, populate in `useEffect`. `queueMicrotask` for initial clock set (React 19)
- **Colors in render**: raw `"var(--color-name)"` strings only — never `cssVar()` in JSX
- **No hardcoded hex** — add to `globals.css @theme` first
- **Session classification**: always `classifySessionFinal()` — never local thresholds
- **ECharts scatter**: always `emphasis: { focus: "series" }` + `blur: { itemStyle: { opacity: 0.12 } }`
- **Upserts**: `session_summary` + `trading_plans` always `onConflict: "date"`
- **VIX/VIX1D**: always `tick.last`
- **Skew**: only valid from 2026-04-02
- **ES OHLC filter**: `high/low not null and > 0` (old rows have null)
- **Overnight UTC**: `prev T20:00:00Z` → `date T13:30:00Z` (EDT). Never T21.
- **Dealer CEX**: positive = bearish = blue. Negative = bullish = amber. Never invert.
- **Wall extraction**: ±50pt, top-3 MetricsGrid / top-5 chart, ranked by |value|
- **weekly_straddle_snapshots**: needs anon + auth read RLS policies
- **QuantedOptions history**: available from 2026-04-16 only
- **Supabase max-rows**: 15000 — all analysis queries need explicit `.limit()`

---

## Pending

### Near-term

- Dealer 09:30 fix: 90s delay so straddle writes spot first
- Watchdog Globex gate: stop post-close reconnect spam
- ES hedge flow on SPOT CEX: `≈N ES/5m = local_CEX / 78 / (spot × 50)`
- SML Fly ECharts migration (last Lightweight Charts holdout)
- Analysis `fetchAll()` paginator + `session_summary` materialization

### Analysis enrichment (needs data)

- Per-session drill-down: GEX timeline, wall hit/miss, regime narrative
- Opening GEX regime tag on session table rows
- Charm decay overlay (local CEX magnitude, multi-session)
- Session heatmap calendar
- Correlation matrix: GEX sign vs session type (~20+ sessions needed)

### Tabs

- POSITIONS: expanded Greeks panel
- CHART: multi-instrument series
- MACRO: calendar + term structure

### Medium term

- Trading plan redesign: magnitude + character forecasts
- `session_summary` close-cycle enrichment (overnight range, skew change, move metrics)
- Regime score feedback loop in analysis
