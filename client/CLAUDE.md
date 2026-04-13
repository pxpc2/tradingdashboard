# Vovonacci Dashboard

Personal SPX options monitoring dashboard. Real-time data from Tastytrade/DXFeed, stored in Supabase, displayed in Next.js.

---

## Stack

- **Poller**: Node.js (`server/poller.mjs`) on Railway
- **Database**: Supabase (PostgreSQL + Realtime)
- **Frontend**: Next.js (`client/`) with Tailwind, Lightweight Charts v5, TypeScript
- **Auth**: Supabase Auth (email/password, single user), session via `@supabase/ssr` cookies
- **Data source**: Tastytrade API via OAuth2 refresh token, DXFeed/DXLink WebSocket streaming
- **Fonts**: IBM Plex Sans (labels/UI) + IBM Plex Mono (numbers/values) via `next/font/google`

---

## Project Structure

```
server/
  poller.mjs              # Entry point only — startup, signal handlers
  lib/
    clients.mjs           # Supabase + Tastytrade client singletons
    market-hours.mjs      # isMarketHours, isGlobexHours, msUntilNextMinute, currentBarTime
    dxfeed.mjs            # getQuotes, getSpxOpenPrice, getSpxQuoteMid, getEsMid, getIndexLast, collectOhlc, withTimeout
    bsm.mjs               # normalCDF, bsmPrice, bsmDelta, invertIV, findDeltaStrike, findTargetExpiry, isValidQuote
  loops/
    main.mjs              # runCycle, runAndScheduleNext, skew, SML fly, session_summary, weekly straddle
    ohlc.mjs              # runOhlcLoop — wall-clock anchored, bar_time, ES+SPX+VIX+VIX1D

client/app/
  page.tsx                # SSR initial data fetch, renders LiveDashboard
  layout.tsx              # Fonts, CSS vars
  globals.css             # Scrollbar styles
  types.ts                # ALL shared types — never redeclare locally
  proxy.ts                # Auth middleware
  loading.tsx             # Route transition loading animation
  lib/
    supabase.ts           # createBrowserClient
    supabase-server.ts    # createSupabaseServerClient
    supabase-middleware.ts
  login/
    page.tsx / actions.ts / SubmitButton.tsx
  analysis/
    page.tsx              # Auth-protected SSR, renders AnalysisDashboard
    loading.tsx
    AnalysisDashboard.tsx # Session grouping + all analysis views
    components/
      ImpliedVsRealized.tsx   # Scatter (ECharts)
      RatioHistogram.tsx      # Distribution (ECharts)
      DecayCurve.tsx          # Normalized decay avg vs today (ECharts)
  tradingplan/
    page.tsx              # Auth-protected SSR, renders TradingPlanDashboard
    loading.tsx
    TradingPlanDashboard.tsx  # Orchestrator, computeScore(), savePlan()
    components/
      PreMarketSection.tsx    # Auto metrics + VS3D inputs + score breakdown + regime output
      ConditionLog.tsx        # Timestamped CONFIRM/REGIME_BREAK/TRADE/NOTE entries
      PostSessionReview.tsx   # Post-session detailed review form
      PlanHistoryTable.tsx    # Past plans table, expandable rows
  hooks/
    useStraddleData.ts
    useFlyData.ts
    useSkewHistory.ts     # All skew_snapshots >= 2026-04-02
    useEsData.ts
    useLiveTick.ts        # DXFeed WebSocket, Quote+Summary+Trade, exports TickData
    useWatchlist.ts
    useMacroEvents.ts
    useRealPositions.ts   # Fetches /api/real-positions every 30s
  components/
    LiveDashboard.tsx     # Main orchestrator
    WorldClock.tsx        # CHI/NY/BSB/LDN with ET-relative offset
    StraddleSpxChart.tsx  # Straddle + SPX + skew-adjusted 1σ levels
    SkewHistoryChart.tsx  # All-time skew, avg line, day separators
    PositionsPanel.tsx    # Real (grouped trades) + SML Fly toggle
    WatchlistStrip.tsx    # Auto-scrolling ticker
    MacroEvents.tsx
    Converter.tsx
  api/
    quotes/route.ts
    chain/route.ts
    pdhl/route.ts
    dxfeed-token/route.ts
    macro-events/route.ts
    watchlist/route.ts
    real-positions/route.ts   # GET — Tastytrade positions, OCC+future option parsing
```

---

## Supabase Tables

```
straddle_snapshots   id, created_at, spx_ref, atm_strike, call_bid, call_ask,
                     put_bid, put_ask, straddle_mid, es_basis (nullable)

rtm_sessions         id, created_at, sml_ref, sal_ref, widths (int[]), type
sml_fly_snapshots    id, created_at, session_id, width, mid, bid, ask

skew_snapshots       id, created_at, skew, put_iv, call_iv, atm_iv,
                     expiration_date, put_strike, call_strike
                     -- Only >= 2026-04-02 is valid

positions / position_legs   (manual tracking, not Tastytrade sync)

es_snapshots         id, created_at, bar_time, es_ref, open, high, low
spx_snapshots        id, created_at, bar_time, open, high, low, close
vix_snapshots        id, created_at, bar_time, open, high, low, close
vix1d_snapshots      id, created_at, bar_time, open, high, low, close

weekly_straddle_snapshots  id, created_at, expiry_date, spx_ref, atm_strike,
                           call_bid, call_ask, put_bid, put_ask, straddle_mid

session_summary      id, date (unique), created_at, updated_at
                     opening_spx, opening_atm_strike, opening_straddle,
                     opening_skew, opening_put_iv, opening_call_iv, opening_atm_iv,
                     opening_vix, opening_vix1d, opening_vix1d_vix_ratio,
                     opening_es_basis, has_high_impact_macro, day_of_week
                     closing_spx, closing_straddle, closing_skew,
                     realized_move_pts, realized_move_pct_of_straddle,
                     max_intraday_pts, max_intraday_pct_of_straddle,
                     spx_closed_above_open, skew_direction

trading_plans        id, date (unique), created_at, updated_at
                     skew_value, skew_pctile, vix1d_vix_ratio,
                     weekly_implied_move, spx_vs_weekly_atm,
                     has_macro, macro_events, opening_straddle,
                     gamma_regime, balance_strikes, test_strikes,
                     vs3d_context, overnight_es_range,
                     regime_score, regime_bias, score_breakdown (jsonb),
                     condition_log (jsonb []),
                     actual_regime, bias_was_correct, regime_confirmed_at,
                     levels_held, trade_outcome, lesson, accuracy_rating
```

---

## Poller Architecture

### Wall-Clock Anchoring

Both loops use `msUntilNextMinute()` — never fixed `setTimeout(fn, 60000)`.
`currentBarTime()` = floor of current minute as ISO string.

### `runAndScheduleNext()` — loops/main.mjs

- RTH only (09:30–16:00 ET weekdays)
- **Open cycle** at 09:30:00–09:30:30 ET:
  - Logs DXFeed Summary.openPrice, DXFeed Quote mid, FMP 09:30 bar — for validation
  - Currently uses DXFeed for decisions, FMP is observational
  - Calls `writeOpenSummary()` + `captureWeeklyStraddle()` (Monday only) — fire-and-forget
- Each cycle: chain → SPX quote → ATM straddle → `straddle_snapshots`
- Skew every 5th cycle → `skew_snapshots`
- SML Fly if active session
- **Close cycle** at 16:00–16:01 ET: calls `writeCloseSummary()` — fire-and-forget

### `runOhlcLoop()` — loops/ohlc.mjs

- Quote symbols (bid/ask mid): ES, SPX
- Trade symbols (Trade event price): VIX, VIX1D
- All inserts include `bar_time`

### ES Symbol

- Current: `/ESM26:XCME` — next roll Sep 2026 → `/ESU26:XCME`

---

## UI Architecture

### LiveDashboard

Single-view, always-live. `?date=YYYY-MM-DD` param for dev testing (needs Suspense).

```
HEADER: WatchlistStrip | Converter | Analysis link | OUT
WORLD CLOCK: CHI ET-1 | NY ET+0 | BSB ET+1 | LDN ET+5
SPX % | ES % | VIX | VIX1D
STRADDLE | IMPLIED | REALIZED | IV30 | SKEW+%ile | CALL/PUT IV | 1D VOL RATIO
Straddle+SPX+1σ chart  |  Skew History
Macro Events           |  Positions (Real/SML Fly)
```

### Analysis Route (`/analysis`)

Auth-protected SSR. ECharts. Static analysis on historical data.

- Implied vs Realized scatter
- Ratio histogram
- Straddle decay curve (avg + today overlay)
- Session log table

### Trading Plan Route (`/tradingplan`)

Auth-protected SSR. Access via URL only (no nav link).

**Regime scoring (max ±6):**
| Signal | Trending | Reverting | Neutral |
|---|---|---|---|
| Gamma regime (2pts) | negative | positive | mixed |
| Skew percentile (1pt) | >75th | <25th | 25-75th |
| VIX1D/VIX (1pt) | >1.1 | <0.9 | 0.9-1.1 |
| Overnight ES range (1pt) | wide | tight | normal |
| Balance at price (1pt) | no balance | balance present | — |

**Bias labels:** TRENDING (high-conf) ≥+4 | TRENDING (low-conf) +2/+3 | UNCLEAR -1/+1 | REVERTING (low-conf) -2/-3 | REVERTING (high-conf) ≤-4

**Condition log types:** CONFIRM | REGIME_BREAK | TRADE | NOTE

Macro tracked as boolean, displayed but not scored.

### Real Positions — Trade Grouping

Legs grouped by:

1. Sort by `createdAt`
2. Cluster within **10 seconds** + same underlying + expiry + optionType
3. Classify cluster: Naked (1 leg) | Vertical Spread (2 legs, opposite dirs, equal qty) | Butterfly (3 legs, symmetric wings, center qty = 2× wing)
4. Unknown clusters → show legs individually (fallback)

Symbol parsing handles both OCC equity options and future options:

- OCC: `"SPXW  260417C06820000"` → strike / 1000
- Future: `"./ESM6 E2AJ6 260413P6750"` → strike as-is

ES options multiplier = 50 (from API, not hardcoded).

### Skew-Adjusted 1σ Levels

```
downsidePts = opening.spx_ref * openingSkew.put_iv * sqrt(1/252)
upsidePts   = opening.spx_ref * openingSkew.call_iv * sqrt(1/252)
```

Fixed at open, semi-transparent lines on SPX series.

---

## Live Ticks — useLiveTick

One WebSocket, LiveDashboard only. `TickData`: `{ bid, ask, mid, prevClose, last }`

- VIX/VIX1D: always `tick.last`
- Symbols = CORE + watchlist + real position streamer symbols

## WatchlistStrip

SPX+ES prepended. 80s ticker, pauses on hover. Price: `mid === 0 ? last : mid`.

## Skew History

Fetches ALL `skew_snapshots >= '2026-04-02'`. Returns `{ skewHistory, latestSkew, avgSkew }`.

## Skew Percentile

```typescript
const skewPctile = useMemo(() => {
  if (!latestSkew || skewHistory.length === 0) return null;
  const below = skewHistory.filter((s) => s.skew <= latestSkew.skew).length;
  return Math.round((below / skewHistory.length) * 100);
}, [latestSkew, skewHistory]);
```

---

## Pending / Planned

### Next

- ES overnight range + gap → `session_summary` (poller addition)
- `/charts` route — continuous time series: SPX/ES/VIX with metrics overlaid
- Weekly straddle display after first Monday data
- VS3D screenshot → Claude vision → auto-extract balance/test levels into trading plan
- Date range filter on `/analysis`
- Conditional stats in `/analysis` (needs session_summary to accumulate)

### Backlog

- OptionsDepth GEX API when budget allows
- DXFeed auth reconnect
- Holiday list in poller
- Mobile polish

---

## Key Conventions

- **Always ask for current file before modifying** — Pedro tweaks between sessions
- **Timezones**: UTC stored, CT displayed, ET for market hours gating
- **Hooks own data, components own UI**
- **useLiveTick**: LiveDashboard only, one WebSocket
- **todayRows**: always filter by ET date
- **es_basis**: only non-null on first straddle row of the day
- **Skew data**: only valid from 2026-04-02
- **VIX/VIX1D**: symbols `"VIX"`/`"VIX1D"`, always `tick.last`
- **bar_time**: use `currentBarTime()`, never hardcode
- **Scheduling**: always `msUntilNextMinute()`, never fixed 60s
- **session_summary**: upsert with `onConflict: "date"`
- **trading_plans**: upsert with `onConflict: "date"`
- **Real positions**: `balancesAndPositionsService.getPositionsList()`
- **Trade grouping**: 10s cluster window, Unknown always falls back to individual legs
- **ECharts**: `/analysis` and `/tradingplan` scoring only — live charts use Lightweight Charts
- **Opening price**: DXFeed for decisions, FMP logged for comparison only
