# Vovonacci Dashboard

Personal SPX options monitoring dashboard. Real-time data from Tastytrade/DXFeed, stored in Supabase, displayed in Next.js.

---

## Stack

- **Poller**: Node.js (`server/poller.mjs`) on Railway
- **Database**: Supabase (PostgreSQL + Realtime)
- **Frontend**: Next.js (`client/`) with Tailwind 4, Lightweight Charts v5, ECharts, TypeScript
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
  globals.css             # Tailwind 4 @theme block — canonical source of colors
  types.ts                # ALL shared types — never redeclare locally
  proxy.ts                # Auth middleware (Next.js 16 uses proxy not middleware)
  loading.tsx             # Route transition loading animation
  lib/
    supabase.ts           # createBrowserClient
    supabase-server.ts    # createSupabaseServerClient — server components only
    supabase-middleware.ts
    theme.ts              # CSS var REFERENCES (JSX inline style use) + cssVar() + withOpacity()
    chartPalette.ts       # resolveChartPalette() — hex values for ECharts/canvas
    sessionCharacter.ts   # computeSkewCharacter, computePriceCharacter,
                          # classifySessionFinal, buildLiveRead,
                          # SESSION_TYPE_COLOR, SKEW_STRENGTH_COLOR, TONE_COLOR,
                          # resolveSessionTypeColors (canvas)
  login/
    page.tsx / actions.ts / SubmitButton.tsx
  analysis/
    page.tsx              # Auth-protected SSR — fetches straddle, skew, es, weekly straddle
    loading.tsx
    AnalysisDashboard.tsx # Session grouping, SessionData type, filters
    components/
      ImpliedVsRealized.tsx   # Scatter: opening straddle vs realized (ECharts)
      RatioHistogram.tsx      # RV/IV distribution histogram (ECharts)
      DecayCurve.tsx          # Normalized straddle decay avg vs today (ECharts)
      StraddleHistory.tsx     # Opening straddle per session + percentile (ECharts)
      DayOfWeekBreakdown.tsx  # Avg RV/IV by day of week (ECharts)
      MaxVsEod.tsx            # Magnitude + character scatter, 4 session types (ECharts)
      SkewVsRealized.tsx      # Skew intraday change zones vs EOD/max retention (ECharts)
      OvernightRange.tsx      # Overnight ES range vs RV/IV scatter (ECharts)
      VixVsRealized.tsx       # VIX1D/VIX ratio vs RV/IV (ECharts)
      WeeklyStraddle.tsx      # Weekly implied range bar, SPX position, RV/IV per week
  tradingplan/
    page.tsx              # Auth-protected SSR
    loading.tsx
    TradingPlanDashboard.tsx  # Orchestrator, computeScore(), savePlan(), computeSkewTrend()
    components/
      PreMarketSection.tsx    # Auto metrics + VS3D inputs + score breakdown
      ConditionLog.tsx        # Timestamped CONFIRM/REGIME_BREAK/TRADE/NOTE entries
      PostSessionReview.tsx   # Post-session review + closing skew input
      PlanHistoryTable.tsx    # Past plans table, expandable rows
  hooks/
    useStraddleData.ts / useFlyData.ts / useSkewHistory.ts
    useEsData.ts / useLiveTick.ts / useWatchlist.ts
    useMacroEvents.ts / useRealPositions.ts
  components/
    LiveDashboard.tsx       # Main orchestrator
    WorldClock.tsx          # CHI/NY/BSB/LDN with ET-relative offset
    StraddleSpxChart.tsx    # Straddle + SPX + skew-adjusted 1σ levels
    SkewHistoryChart.tsx    # All-time skew, avg line, day separators
    PositionsPanel.tsx      # Real (grouped trades, Greeks, max P&L) + SML Fly toggle
    WatchlistStrip.tsx      # Auto-scrolling ticker
    SkewCharacterBadge.tsx  # Today's skew direction + strength (live)
    LiveReadLine.tsx        # Narrated cross-reference of price + skew (live)
    MacroEvents.tsx / Converter.tsx
  api/
    quotes/route.ts / chain/route.ts / pdhl/route.ts
    dxfeed-token/route.ts / macro-events/route.ts
    watchlist/route.ts / real-positions/route.ts
```

---

## Theme System

**Single source of truth: `globals.css` `@theme` block.** Tailwind 4's @theme auto-generates both CSS variables AND utility classes.

Three layers of color access, each with a purpose:

1. **Tailwind utility classes** (`bg-page`, `text-text-2`, `border-border`) — for 90% of JSX. Auto-generated from `@theme` tokens. Reads live from CSS.

2. **`THEME` from `lib/theme.ts`** — CSS variable REFERENCES for inline styles. `style={{ color: THEME.amber }}` emits `style={{ color: 'var(--color-amber)' }}`. Browser resolves at render → editing `globals.css` propagates everywhere.

3. **`resolveChartPalette()` from `lib/chartPalette.ts`** — resolved hex values for ECharts/canvas. Call inside `useEffect` — reads CSS var computed values at runtime. Canvas libraries can't interpret `var()` directly.

**Never hardcode hex in component code.** If a color is missing a token, add one to `globals.css` first.

**Opacity variants**: use `withOpacity(THEME.up, 0.4)` — returns `color-mix(in srgb, var(--color-up) 40%, transparent)`. Don't concat like `${THEME.up}66` (produces invalid `var(--color-up)66`).

**To verify theming works**: change `--color-up` in `globals.css` to something obvious (e.g. `#ff00ff`), hard-refresh, see all up-related things turn magenta, revert.

### Palette

**Foundation**: page `#0a0a0a` (warm black, Bloomberg-feel), panel `#121214`, panel-2 `#17171a`, border `#1f1f21`, border-2 `#2a2a2d`.

**Text (6-step warm scale)**: `text #e8e6e0` → `text-2 #9a9890` → `text-3 #6e6c67` → `text-4 #555350` → `text-5 #44433f` → `text-6 #2f2e2c`.

**Semantic (live dashboard — muted)**:

- `up #7fc096` sage / `down #d0695e` warm coral — prices, P&L, long/short, status
- `amber #f5a524` — signature attention (trending signal, warnings). Used sparingly.
- `indigo #7ea8c4` — reverting signal, secondary info

**Regime (analysis — punchy, categorically distinct)**:

- `regime-trend #e55a3f` coral-red — Trend day
- `regime-partial #e6b84f` gold — Trend with partial reversal
- `regime-reversal #5bb4a0` teal — Reversal day
- `regime-flat #707070` gray — Flat day

**Skew character**: `skew-flat #9a9890` / `skew-moving #9b7bb3` purple / `skew-strong #f5a524` amber.

**Live read tones**: `tone-quiet`, `tone-normal`, `tone-attention`, `tone-alert`.

**SML fly widths**: 10→purple, 15→indigo, 20→amber, 25→teal, 30→coral.

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

- `writeOpenSummary()` — VIX+VIX1D from `vix_snapshots`/`vix1d_snapshots` first bar (90s wait for OHLC loop), FMP macro check, upserts opening fields
- `writeCloseSummary()` — computes realized/max/skew direction, **backfills opening_skew** from first skew snapshot
- Always upsert with `onConflict: "date"` — safe to re-run
- Both are fire-and-forget (.catch wrapped) — never block main cycle

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

## Session Classification Framework

Live and post-session classification live in `lib/sessionCharacter.ts`.

**Two axes:**

- **Magnitude** = `maxMovePct / 100` (straddle multiples — how big was the biggest move)
- **Character** = `eodMovePct / maxMovePct` (retention — how much of that move held)

**Four types** via `classifySessionFinal(maxMovePct, eodMovePct)`:

| Type                            | Rule                                                      | Meaning                          |
| ------------------------------- | --------------------------------------------------------- | -------------------------------- |
| **Trend day**                   | character ≥ 0.7 at any magnitude                          | Price held direction into close  |
| **Trend with partial reversal** | magnitude ≥ 1.0 AND character 0.4–0.7                     | Exceeded implied, gave some back |
| **Reversal day**                | magnitude ≥ 1.0 AND character < 0.4                       | Exceeded implied, reverted       |
| **Flat day**                    | magnitude < 0.3, OR (magnitude < 1.0 AND character < 0.7) | No directional conviction        |

Used by `/analysis` scatter charts AND post-session review.

### Live Session Character — `LiveDashboard` only

**`computeSkewCharacter(todaySnapshots)`** returns:

- `strength`: max intraday excursion from open. `flat < 0.008`, `moving 0.008–0.015`, `strongly_moving > 0.015`
- `direction`: net change vs open. `rising > +0.003`, `falling < -0.003`, else `flat`

**`computePriceCharacter(openingSpx, currentSpx, maxSpx, minSpx, openingStraddle)`** returns magnitude + character + direction + live classification (same 4 types plus `insufficient`).

**`buildLiveRead(price, skew)`** synthesizes both into a narrated line:

- Trending price + moving skew → "directional move confirmed by options"
- Trending price + flat skew → "reversal risk elevated, options not confirming"
- Flat price + strongly moving skew → "vol sendo comprada sem movimento, observar"
- Etc. Rendered by `LiveReadLine.tsx`, tones map to `tone-quiet/normal/attention/alert`.

---

## UI Architecture

### LiveDashboard

Single-view, always-live. `?date=YYYY-MM-DD` param for dev testing (needs Suspense).

```
HEADER: WatchlistStrip | Converter | Analysis link | OUT
WORLD CLOCK: CHI ET-1 | NY ET+0 | BSB ET+1 | LDN ET+5
SPX % | ES % | VIX % | VIX1D %
STRADDLE | IMPLIED | REALIZED | IV30 | SKEW+%ile | SKEW HOJE | CALL/PUT IV | 1D VOL RATIO
LIVE READ: narrated price + skew character (RTH only)
Straddle+SPX+1σ chart  |  Skew History (all-time)
Macro Events           |  Positions (Real default / SML Fly)
```

**SKEW HOJE** = today's skew character (arrow + strength label + max Δ). Colors via `SKEW_STRENGTH_COLOR`: flat gray, moving purple `#9b7bb3`, strongly moving amber.

**LIVE READ** = narrated synthesis. Only renders during RTH (via `spxOpen` guard). Shows nothing when insufficient data.

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
  snapshots,
  openingVix, openingVix1d, vix1dVixRatio,
  hasMacro, spxClosedAboveOpen,
}
```

**Overnight range** — always filter es_snapshots:

```typescript
e.high !== null && e.low !== null && e.high > 0 && e.low > 0;
// Without this, old rows with null OHLC produce 6000+ pt "ranges"
```

**Regime-colored charts** (MaxVsEod, VixVsRealized, SkewVsRealized, OvernightRange): use shared `classifySessionFinal()` + `resolveSessionTypeColors()`. All scatters have `emphasis: { focus: "series" }` + `blur: { itemStyle: { opacity: 0.12 } }` — hovering a legend entry or data point fades other series.

**SkewVsRealized** — skew movement zones on X axis, retention on Y:

- Fell < -0.005 | Flat ±0.005 | Rose > +0.005
- Y = `(realizedMovePct / maxMovePct) * 100` — how much of max held into close
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
| Overnight ES range (1pt) | tight | wide | normal |
| Balance at price (1pt) | no balance | balance present | — |

**Overnight range direction (confirmed)**: tight ON → trending RTH (+1), wide ON → reverting RTH (-1). Earlier data (4 sessions) flagged this as uncertain, but Apr 13–17 validated: tight ON (187–260% RV/IV trending) vs wide ON Apr 08 (44.9% RV/IV reverting).

Macro tracked as boolean — NOT scored (can be mean-reverting on FOMC days).

**Bias labels** use muted palette (live side):

- `TRENDING (high-conf)` → amber (full)
- `TRENDING (low-conf)` → amber 60% opacity
- `UNCLEAR` → text-4
- `REVERTING (low-conf)` → indigo 60% opacity
- `REVERTING (high-conf)` → indigo

**Scoring is scoped for redesign**: magnitude + character forecasts (not numeric score), auto-classification post-session. Dropping skew percentile, VIX1D/VIX, balance strikes from scoring when data validates.

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

- **Trading plan redesign**: replace numeric score with magnitude + character forecasts,
  auto-classification post-session, forecast-vs-actual feedback loop (DB schema changes needed)
- **Closing VIX1D/VIX** in `writeCloseSummary` — unlocks intraday ratio change signal
- **Today's intraday skew on `/tradingplan`** — requires server fetch change to enable
  `SkewCharacterBadge` + `LiveReadLine` there (currently live dashboard only)

### Short Term

- **VS3D Playwright automation**: connect to existing Chrome via CDP (port 9222),
  capture position grid + gamma + charm every 30min RTH, POST to `/api/vs3d-snapshot`,
  Claude vision extracts structured data, store in `vs3d_snapshots` table
- `/charts` route — continuous time series: SPX/ES/VIX with metrics overlaid
- Regime score feedback loop — score vs `actual_regime` in `/analysis`
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
- **Colors**: never hardcode hex — add tokens to `globals.css @theme` first, then use via Tailwind / `THEME` / `cssVar()` / `resolveChartPalette()`
- **Session classification**: always via `classifySessionFinal()` from `lib/sessionCharacter.ts` — never local thresholds
- **ECharts scatter**: always add `emphasis: { focus: "series" }` + `blur: { itemStyle: { opacity: 0.12 } }` for legend hover clarity
