# Vovonacci Dashboard

Personal SPX options monitoring dashboard. Real-time data from Tastytrade/DXFeed, stored in Supabase, displayed in Next.js.

---

## Stack

- **Poller**: Node.js (`server/poller.mjs`) on Railway
- **Database**: Supabase (PostgreSQL + Realtime)
- **Frontend**: Next.js (`client/`) with Tailwind, Lightweight Charts v5, ECharts, TypeScript
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
    dxfeed.mjs            # getQuotes, getSpxOpenPrice, getSpxQuoteMid, getEsMid,
                          # getIndexLast, collectOhlc, withTimeout
    bsm.mjs               # normalCDF, bsmPrice, bsmDelta, invertIV, findDeltaStrike,
                          # findTargetExpiry, isValidQuote
  loops/
    main.mjs              # runCycle, runAndScheduleNext, skew, SML fly,
                          # session_summary, weekly straddle
    ohlc.mjs              # runOhlcLoop — wall-clock anchored, ES+SPX+VIX+VIX1D

client/app/
  page.tsx                # SSR initial data fetch, renders LiveDashboard
  layout.tsx              # Fonts, CSS vars
  globals.css             # Scrollbar styles
  types.ts                # ALL shared types — never redeclare locally
  proxy.ts                # Auth middleware (Next.js 16 uses proxy not middleware)
  loading.tsx             # Route transition loading animation
  lib/
    supabase.ts           # createBrowserClient
    supabase-server.ts    # createSupabaseServerClient — server components only
    supabase-middleware.ts
  login/
    page.tsx / actions.ts / SubmitButton.tsx
  analysis/
    page.tsx              # Auth-protected SSR — fetches straddle, skew, es, weekly straddle
    loading.tsx
    AnalysisDashboard.tsx # Session grouping, SessionData type, all analysis views
    components/
      ImpliedVsRealized.tsx   # Scatter: opening straddle vs realized move (ECharts)
      RatioHistogram.tsx      # RV/IV distribution histogram (ECharts)
      DecayCurve.tsx          # Normalized straddle decay avg vs today (ECharts)
      StraddleHistory.tsx     # Opening straddle per session + percentile (ECharts)
      DayOfWeekBreakdown.tsx  # Avg RV/IV by day of week (ECharts)
      MaxVsEod.tsx            # Max intraday vs EOD — trending/reverting scatter (ECharts)
      SkewVsRealized.tsx      # Skew intraday change (3 zones) vs EOD/max retention (ECharts)
      OvernightRange.tsx      # Overnight ES range vs RV/IV scatter (ECharts)
      WeeklyStraddle.tsx      # Weekly implied range bar, SPX position, RV/IV per week
  tradingplan/
    page.tsx              # Auth-protected SSR — fetches plans, skew, straddle, weekly, recent skew
    loading.tsx
    TradingPlanDashboard.tsx  # Orchestrator, computeScore(), savePlan(), computeSkewTrend()
    components/
      PreMarketSection.tsx    # Auto metrics (skew+pctile+trend+ratio) + VS3D inputs + score
      ConditionLog.tsx        # Timestamped CONFIRM/REGIME_BREAK/TRADE/NOTE entries
      PostSessionReview.tsx   # Post-session review + closing skew input + auto direction
      PlanHistoryTable.tsx    # Past plans table, expandable rows
  hooks/
    useStraddleData.ts
    useFlyData.ts
    useSkewHistory.ts     # All skew_snapshots >= 2026-04-02
    useEsData.ts
    useLiveTick.ts        # DXFeed WebSocket, Quote+Summary+Trade+Greeks events
    useWatchlist.ts
    useMacroEvents.ts
    useRealPositions.ts   # Fetches /api/real-positions every 30s
  components/
    LiveDashboard.tsx     # Main orchestrator
    WorldClock.tsx        # CHI/NY/BSB/LDN with ET-relative offset
    StraddleSpxChart.tsx  # Straddle + SPX + skew-adjusted 1σ levels
    SkewHistoryChart.tsx  # All-time skew, avg line, day separators
    PositionsPanel.tsx    # Real (grouped trades, Greeks, max P&L) + SML Fly toggle
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
    real-positions/route.ts  # GET — Tastytrade positions, OCC+future option parsing
```

---

## Supabase Tables

```
straddle_snapshots   id, created_at, spx_ref, atm_strike, call_bid, call_ask,
                     put_bid, put_ask, straddle_mid, es_basis (nullable — open cycle only)

rtm_sessions         id, created_at, sml_ref, sal_ref, widths (int[]), type
sml_fly_snapshots    id, created_at, session_id, width, mid, bid, ask

skew_snapshots       id, created_at, skew, put_iv, call_iv, atm_iv,
                     expiration_date, put_strike, call_strike
                     -- Only >= 2026-04-02 is valid
                     -- Formula: skew = (put_iv - call_iv) / atm_iv  [25-delta risk reversal]
                     -- Missing normalization constant 3/N⁻¹(0.75) ≈ 4.45x — used comparatively only

positions / position_legs   (manual SML fly tracking, not Tastytrade sync)

es_snapshots         id, created_at, bar_time, es_ref, open, high, low
                     -- open/high/low only populated after OHLC loop was added
                     -- historical rows have null open/high/low — always filter these out
spx_snapshots        id, created_at, bar_time, open, high, low, close
vix_snapshots        id, created_at, bar_time, open, high, low, close
vix1d_snapshots      id, created_at, bar_time, open, high, low, close

weekly_straddle_snapshots  id, created_at, expiry_date, spx_ref, atm_strike,
                           call_bid, call_ask, put_bid, put_ask, straddle_mid
                           -- Captured Monday open cycle only
                           -- Requires BOTH anon read AND auth read RLS policies

session_summary      id, date (unique), created_at, updated_at
                     opening_spx, opening_atm_strike, opening_straddle,
                     opening_skew, opening_put_iv, opening_call_iv, opening_atm_iv,
                     opening_vix, opening_vix1d, opening_vix1d_vix_ratio,
                     opening_es_basis, has_high_impact_macro, day_of_week
                     closing_spx, closing_straddle, closing_skew,
                     realized_move_pts, realized_move_pct_of_straddle,
                     max_intraday_pts, max_intraday_pct_of_straddle,
                     spx_closed_above_open, skew_direction
                     -- opening_skew backfilled at close cycle from first skew snapshot

trading_plans        id, date (unique), created_at, updated_at
                     skew_value, skew_pctile, vix1d_vix_ratio,
                     weekly_implied_move, spx_vs_weekly_atm,
                     has_macro, macro_events, opening_straddle,
                     gamma_regime, balance_strikes, test_strikes,
                     vs3d_context, overnight_es_range,
                     regime_score, regime_bias, score_breakdown (jsonb),
                     condition_log (jsonb []),
                     actual_regime, bias_was_correct, regime_confirmed_at,
                     levels_held, trade_outcome, lesson, accuracy_rating,
                     closing_skew, skew_direction
```

---

## Poller Architecture

### Wall-Clock Anchoring
Both loops use `msUntilNextMinute()` — never fixed `setTimeout(fn, 60000)`.
`currentBarTime()` = floor of current minute as ISO string.

### `runAndScheduleNext()` — loops/main.mjs
- RTH only (09:30–16:00 ET weekdays)
- **Open cycle** at 09:30:15–09:30:45 ET:
  - Uses **DXFeed Quote mid** for both `spx_ref` and ATM selection — not Summary.openPrice
  - FMP 09:30 bar logged for observational reference only, not used for decisions
  - Calls `writeOpenSummary()` + `captureWeeklyStraddle()` (Monday only) — fire-and-forget
- Each cycle: chain → SPX Quote mid → ATM straddle → `straddle_snapshots`
- Skew every 5th cycle (~5 min) → `skew_snapshots`
- SML Fly if active `rtm_sessions` row exists for today
- **Close cycle** at 16:00–16:01 ET: calls `writeCloseSummary()` — fire-and-forget

### Session Summary
- `writeOpenSummary()` — VIX+VIX1D via `getIndexLast()`, FMP macro check, upserts opening fields
- `writeCloseSummary()` — computes realized/max/skew direction, **backfills opening_skew** from first skew snapshot
- Always upsert with `onConflict: "date"` — safe to re-run
- Both are fire-and-forget (.catch wrapped) — never block main cycle

### getIndexLast() — VIX/VIX1D
- Primary: waits for Trade event (actual last price)
- After 8s: falls back to Summary.prevDayClosePrice (fires immediately on subscribe)
- Overall timeout: 20s
- Returns null on total timeout — VIX fields will be null in session_summary

### Weekly Straddle
- `captureWeeklyStraddle(options, spxMid)` — Monday open cycle only
- `findNearestFriday()` — next Friday from ET date
- Reuses options array from runCycle — no extra chain fetch

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
SPX % | ES % | VIX % | VIX1D %
STRADDLE | IMPLIED | REALIZED | IV30 | SKEW+%ile | CALL/PUT IV | 1D VOL RATIO
Straddle+SPX+1σ chart  |  Skew History (all-time)
Macro Events           |  Positions (Real default / SML Fly)
```

### Analysis Route (`/analysis`)
Auth-protected SSR. ECharts for all charts. Static analysis on historical data.

**SessionData type** (exported from AnalysisDashboard.tsx):
```typescript
{
  date, dayOfWeek, openingStraddle, openingSpx,
  openingSkew, closingSkew, skewChange,
  closingSpx, realizedMovePts, realizedMovePct,
  maxMovePts, maxMovePct,
  overnightRange, overnightGap,
  snapshots
}
```

**Overnight range** — always filter es_snapshots:
```typescript
e.high !== null && e.low !== null && e.high > 0 && e.low > 0
// Without this, old rows with null OHLC produce 6000+ pt "ranges"
```

**SkewVsRealized** — threshold zones:
- Fell < -0.005 | Flat ±0.005 | Rose > +0.005
- Y axis: EOD/max retention % — how much of max move held into close
- Z-score approach in backlog for 60+ sessions

**WeeklyStraddle** — requires both RLS policies on weekly_straddle_snapshots:
```sql
CREATE POLICY "auth read" ON weekly_straddle_snapshots FOR SELECT TO authenticated USING (true);
```

### Trading Plan Route (`/tradingplan`)
Auth-protected SSR. URL access only — no nav link.

**Regime scoring (max ±6):**
| Signal | Trending | Reverting | Neutral |
|---|---|---|---|
| Gamma regime (2pts) | negative | positive | mixed |
| Skew percentile (1pt) | >75th | <25th | 25-75th |
| VIX1D/VIX (1pt) | >1.1 | <0.9 | 0.9-1.1 |
| Overnight ES range (1pt) | wide | tight | normal |
| Balance at price (1pt) | no balance | balance present | — |

Macro tracked as boolean — NOT scored (can be mean-reverting on FOMC days).

**Overnight range signal direction — UNCERTAIN**: current data (4 sessions) suggests
tight range → trending, wide → reverting. Opposite of hypothesis. Do not change
scoring until 20+ sessions validate.

**Skew context (PreMarketSection, display only — not scored):**
- Skew + percentile
- 3-session trend (expanding/compressing/flat, threshold ±0.005)
- Skew/ATM IV ratio vs recent avg

**Condition log types:** CONFIRM | REGIME_BREAK | TRADE | NOTE

**Post-session closing skew** → auto-computes skew_direction (rose/flat/fell, ±0.005 threshold)

### Real Positions — Trade Grouping
1. Sort legs by `createdAt`
2. Cluster within **10 seconds** + same underlying + expiry + optionType
3. Classify: Naked | Vertical Spread | Butterfly | Unknown (fallback to individual)
4. Expanded view: max profit/loss, % of max, per-leg delta (from DXFeed Greeks), net spread delta

**Greeks from DXFeed** — subscribe to Greeks event type for option streamer symbols:
- Fires for option symbols only (not equities/futures/indices)
- `event.volatility` = actual option IV
- More accurate than BSM approximation with ATM IV

### Skew Interpretation
- Skew rising during trending session → options confirming directional move → trust the trend
- Skew flat/falling during trending session → move not fear-driven → elevated reversal risk
- Skew/ATM IV ratio high → puts specifically bid vs general vol (genuine fear signal)

---

## Live Ticks — useLiveTick
One WebSocket, LiveDashboard only.

**TickData**: `{ bid, ask, mid, prevClose, last, delta, gamma, theta, vega, iv }`
- Greeks populated only for option streamer symbols
- VIX/VIX1D: always `tick.last`
- Symbols = CORE + watchlist + real position streamer symbols

---

## Pending / Planned

### Immediate
- **VS3D Playwright automation**: connect to existing Chrome via CDP (port 9222),
  capture position grid + gamma + charm every 30min RTH,
  POST to `/api/vs3d-snapshot`, Claude vision extracts structured data,
  store in `vs3d_snapshots` table
- Verify tomorrow open: VIX Summary fallback fix, opening_skew backfill, ATM from Quote mid

### Short Term
- `/charts` route — continuous time series: SPX/ES/VIX with metrics overlaid
- Wire `session_summary` into `/analysis` (VIX1D/VIX per session, macro flag filtering)
- Regime score feedback loop — score vs actual_regime in `/analysis`
- Date range filter on `/analysis`

### Medium Term
- Conditional stats in `/analysis` (needs ~30 sessions)
- VS3D correlation charts (gamma regime vs RV/IV, charm vs drift) — needs `vs3d_snapshots`
- ES overnight range → `session_summary` auto-computed (currently manual in trading plan)

### Backlog
- OptionsDepth GEX API when budget allows
- Skew change z-score (replace ±0.005 threshold once 60+ sessions)
- DXFeed auth reconnect
- Holiday list in poller
- Mobile polish

---

## Key Conventions

- **Always ask for current file before modifying** — Pedro tweaks between sessions
- **Timezones**: UTC stored, CT displayed, ET for market hours gating + date strings
- **Hooks own data, components own UI**
- **useLiveTick**: LiveDashboard only, one WebSocket
- **es_basis**: only non-null on first straddle row of the day
- **Skew data**: only valid from 2026-04-02
- **VIX/VIX1D**: symbols `"VIX"`/`"VIX1D"`, always `tick.last`
- **bar_time**: use `currentBarTime()`, never hardcode
- **Scheduling**: always `msUntilNextMinute()`, never fixed 60s
- **session_summary + trading_plans**: upsert with `onConflict: "date"`
- **Real positions**: `balancesAndPositionsService.getPositionsList()`
- **Trade grouping**: 10s cluster window, Unknown always falls back to individual legs
- **ECharts**: `/analysis` + `/tradingplan` only — live dashboard uses Lightweight Charts
- **Opening ATM**: always from DXFeed Quote mid — never Summary.openPrice
- **Overnight range filter**: always `e.high !== null && e.low !== null && e.high > 0 && e.low > 0`
- **weekly_straddle_snapshots**: needs both `anon read` AND `auth read` RLS policies
