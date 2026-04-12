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
    market-hours.mjs      # isMarketHours, isGlobexHours, time utils, msUntilNextMinute, currentBarTime
    dxfeed.mjs            # getQuotes, getSpxOpenPrice, getSpxQuoteMid, getEsMid, getIndexLast, collectOhlc, withTimeout
    bsm.mjs               # normalCDF, bsmPrice, bsmDelta, invertIV, findDeltaStrike, findTargetExpiry, isValidQuote
  loops/
    main.mjs              # runCycle, runAndScheduleNext, skew, SML fly, session_summary, weekly straddle
    ohlc.mjs              # runOhlcLoop — wall-clock anchored, bar_time, ES+SPX+VIX+VIX1D

client/app/
  page.tsx                # SSR initial data fetch, renders LiveDashboard
  layout.tsx              # Loads IBM Plex Sans + Mono, sets --font-sans/--font-mono vars
  globals.css             # Scrollbar styles
  types.ts                # ALL shared types — never redeclare locally
  proxy.ts                # Auth middleware (Next.js 16 uses proxy not middleware)
  loading.tsx             # Route transition loading animation
  lib/
    supabase.ts           # createBrowserClient
    supabase-server.ts    # createSupabaseServerClient — used in server components
    supabase-middleware.ts # updateSession — used in proxy.ts
  login/
    page.tsx              # Login page
    actions.ts            # login() and signOut() server actions
    SubmitButton.tsx      # useFormStatus loading spinner
  analysis/
    page.tsx              # Auth-protected SSR fetch, renders AnalysisDashboard
    loading.tsx           # Route transition loading animation
    AnalysisDashboard.tsx # Client orchestrator — groups sessions, renders all analysis views
    components/
      ImpliedVsRealized.tsx  # Scatter: opening straddle vs realized move (ECharts)
      RatioHistogram.tsx     # Distribution of realized/implied ratio (ECharts)
      DecayCurve.tsx         # Normalized straddle decay avg vs today (ECharts)
  hooks/
    useStraddleData.ts    # straddle_snapshots fetch+realtime, exposes esBasis
    useFlyData.ts         # rtm_sessions + sml_fly_snapshots fetch+realtime
    useSkewHistory.ts     # All skew_snapshots >= April 2, 2026
    useEsData.ts          # es_snapshots fetch+realtime, today only
    useLiveTick.ts        # DXFeed WebSocket, Quote+Summary+Trade events, exports TickData
    useWatchlist.ts       # Fetches Vovonacci watchlist entries from /api/watchlist
    useMacroEvents.ts     # Fetches FMP economic calendar for selected date
    useRealPositions.ts   # Fetches /api/real-positions every 30s, returns legs + streamerSymbols
  components/
    LiveDashboard.tsx     # Main orchestrator — single-view, always-live dashboard
    WorldClock.tsx        # 4-city clock row (CHI, NY, BSB, LDN) with ET-relative offset
    StraddleSpxChart.tsx  # Straddle area + SPX line overlay + skew-adjusted 1σ levels
    SkewHistoryChart.tsx  # All-time 5-min skew history, avg line, day separators
    PositionsPanel.tsx    # Real positions (default) + SML Fly toggle
    WatchlistStrip.tsx    # Auto-scrolling ticker strip in header
    MacroEvents.tsx       # FMP economic calendar, auto-scroll, CT times
    Converter.tsx         # Basis converter, bidirectional, compact prop for topbar
  api/
    quotes/route.ts       # POST — live quotes via Tastytrade SDK
    chain/route.ts        # GET — SPXW option chain
    pdhl/route.ts         # GET — previous day H/L/close
    dxfeed-token/route.ts # GET — returns dxLinkUrl + dxLinkAuthToken
    macro-events/route.ts # GET — FMP economic calendar, US only, UTC→CT, cached
    watchlist/route.ts    # GET — Vovonacci watchlist, futures resolved to front month
    real-positions/route.ts # GET — Tastytrade live positions, parsed OCC symbols
```

---

## Supabase Tables

```
straddle_snapshots   id, created_at, spx_ref, atm_strike, call_bid, call_ask,
                     put_bid, put_ask, straddle_mid, es_basis (nullable — only on open cycle row)

rtm_sessions         id, created_at, sml_ref, sal_ref, widths (int[]), type ('call'|'put')
sml_fly_snapshots    id, created_at, session_id, width, mid, bid, ask

skew_snapshots       id, created_at, skew, put_iv, call_iv, atm_iv,
                     expiration_date, put_strike, call_strike
                     -- Only data >= 2026-04-02 is valid (skew calc fixed April 1)

positions            id, created_at, label, is_active, notes
position_legs        id, created_at, position_id, expiration_date, strike,
                     opt_type, action, quantity, entry_price_mid, streamer_symbol

es_snapshots         id, created_at, bar_time, es_ref (close), open, high, low
spx_snapshots        id, created_at, bar_time, open, high, low, close
vix_snapshots        id, created_at, bar_time, open, high, low, close
vix1d_snapshots      id, created_at, bar_time, open, high, low, close

weekly_straddle_snapshots  id, created_at, expiry_date, spx_ref, atm_strike,
                           call_bid, call_ask, put_bid, put_ask, straddle_mid

session_summary      id, date (unique), created_at, updated_at
                     -- Opening (written at open cycle ~09:30 ET):
                     opening_spx, opening_atm_strike, opening_straddle,
                     opening_skew, opening_put_iv, opening_call_iv, opening_atm_iv,
                     opening_vix, opening_vix1d, opening_vix1d_vix_ratio,
                     opening_es_basis, has_high_impact_macro, day_of_week
                     -- Closing (written at close cycle ~16:00 ET):
                     closing_spx, closing_straddle, closing_skew,
                     realized_move_pts, realized_move_pct_of_straddle,
                     max_intraday_pts, max_intraday_pct_of_straddle,
                     spx_closed_above_open, skew_direction ('up'|'down'|'flat')
```

All tables: RLS enabled, anon read, service role write (poller). Auth write on rtm_sessions, sml_fly_snapshots, positions, position_legs.

---

## Poller Architecture

Entry point: `server/poller.mjs` — connects DXLink, starts two loops, handles SIGINT.

### Wall-Clock Anchoring

Both loops use `msUntilNextMinute()` — drift self-corrects every cycle. Never use fixed `setTimeout(fn, 60000)`. `currentBarTime()` snapshots the minute boundary before collection.

### `runAndScheduleNext()` — loops/main.mjs

- RTH only (09:30–16:00 ET weekdays)
- **Open cycle** at 09:30:00–09:30:30 ET:
  - Fetches SPX open price from both DXFeed (Summary + Quote) and FMP (09:30 1min bar) — logs both for validation
  - Fetches ES basis
  - Calls `writeOpenSummary()` fire-and-forget
  - On Mondays: calls `captureWeeklyStraddle()` fire-and-forget
- Each cycle: chain → SPX quote → ATM straddle → `straddle_snapshots`
- Skew every 5th cycle (~5 min) → `skew_snapshots`
- SML Fly if active `rtm_sessions` row exists for today
- **Close cycle** at 16:00–16:01 ET: calls `writeCloseSummary()` fire-and-forget
- Schedules next via `msUntilNextMinute()`

### Session Summary

- `writeOpenSummary()` — VIX+VIX1D spot via `getIndexLast()`, FMP macro check, upserts opening fields
- `writeCloseSummary()` — reads today's straddle+skew snapshots, computes realized/max/skew direction, upserts closing fields
- Always upsert with `onConflict: "date"` — safe to re-run

### Weekly Straddle

- `captureWeeklyStraddle(options, spxMid)` — fires Monday open cycle only
- Finds nearest Friday SPXW expiry from full chain, captures ATM straddle
- Stores in `weekly_straddle_snapshots`
- `findNearestFriday()` computes next Friday from ET date — if Monday, that's 4 days out

### Opening Price Validation

Every open cycle logs DXFeed Summary, DXFeed Quote mid, and FMP 09:30 bar — including diff and whether ATM strike selection differs. Currently uses DXFeed as before. FMP is observational only — compare after several sessions.

### `runOhlcLoop()` — loops/ohlc.mjs

- Quote symbols (bid/ask mid): ES, SPX
- Trade symbols (Trade event price): VIX, VIX1D
- ES → `es_snapshots` (globex), SPX → `spx_snapshots` (RTH), VIX+VIX1D → their tables (any open session)
- All inserts include `bar_time`

### ES Symbol

- Current: `/ESM26:XCME` (June 2026)
- Next roll: September 2026 → `/ESU26:XCME`
- Format: `/ES{H|M|U|Z}{2-digit-year}:XCME`

---

## UI Architecture

### LiveDashboard

Single-view, always-live. No tabs. `?date=YYYY-MM-DD` URL param overrides today for dev testing (requires Suspense in page.tsx).

```
┌──────────────────────────────────────────────────────────────┐
│ HEADER: WatchlistStrip | Converter | Analysis link | OUT     │
├──────────────────────────────────────────────────────────────┤
│ WORLD CLOCK: CHI ET-1 | NY ET+0 | BSB ET+1 | LDN ET+5       │
├──────────────────────────────────────────────────────────────┤
│ SPX +%  │  ES +%  │  VIX  │  VIX1D                          │
│ STRADDLE | IMPLIED | REALIZED | IV30 | SKEW | CALL/PUT | 1D VOL RATIO │
├──────────────────────┬───────────────────────────────────────┤
│ Straddle+SPX+1σ lvls │ Skew History                         │
├──────────────────────┴───────────────────────────────────────┤
│ Macro Events         │ Positions (Real default / SML Fly)   │
└──────────────────────────────────────────────────────────────┘
```

### Analysis Route (`/analysis`)

Auth-protected SSR page. All data computed client-side from raw snapshots.

- **Implied vs Realized** — scatter, dots colored blue/amber/red by ratio, breakeven line
- **Ratio Histogram** — bins by 0.25x, avg line
- **Straddle Decay** — normalized to open=100%, avg across all past sessions, today overlay
- **Session Log** — table of all sessions, sortable by date, with ratio color coding

All charts use Apache ECharts. No real-time updates — static analysis on historical data.

### Skew-Adjusted 1σ Levels

```
downsidePts = opening.spx_ref * openingSkew.put_iv * sqrt(1/252)
upsidePts   = opening.spx_ref * openingSkew.call_iv * sqrt(1/252)
```

Lines fixed at open, anchored to first skew snapshot of today. Semi-transparent (`#f8717166`, `#4ade8066`). Titles show point distance: `↓65`, `↑38`.

### Real Positions

- `GET /api/real-positions` → Tastytrade `balancesAndPositionsService.getPositionsList(accountNumber)`
- Parses OCC-style option symbols → strike, expiry, type
- `useRealPositions` hook refreshes every 30s
- Streamer symbols added to `useLiveTick` for live mid prices
- P&L = `sign * (mid - averageOpenPrice) * quantity * multiplier`
- Shows "Sem posições abertas" when empty, scrollable leg list when populated

### Typography

- Labels: `font-sans text-xs text-[#555] uppercase tracking-wide`
- Values: `font-mono text-lg text-[#9ca3af] font-light`
- Section headers: Bloomberg-style left border accent (`w-0.5 h-4 bg-[#333]`)

---

## Live Ticks — useLiveTick

- Called once in `LiveDashboard.tsx` only — one WebSocket
- `TickData`: `{ bid, ask, mid, prevClose, last }`
- VIX/VIX1D: always use `tick.last`
- Symbols = CORE + watchlist streamer symbols + real position streamer symbols

---

## WatchlistStrip

- SPX and ES always prepended as static entries
- Items rendered twice for seamless loop, 80s cycle, pauses on hover
- Price: `mid === 0 ? last : mid`
- Edge fade via `maskImage` gradient

---

## Skew History — useSkewHistory

- Fetches ALL `skew_snapshots >= '2026-04-02'`
- Returns: `{ skewHistory, latestSkew, avgSkew, isLoading }`

---

## % Change

- SPX/ES/VIX/VIX1D: `tick.prevClose` from DXFeed Summary
- VIX/VIX1D % may show 0.00% outside RTH
- Watchlist: dimmed when closed

---

## Pending / Planned

### Verify Monday open

- Open cycle logs both DXFeed and FMP refs cleanly
- `session_summary` row written at open and 16:00
- `weekly_straddle_snapshots` row written (Monday only)
- VIX/VIX1D OHLC tables populating with clean `bar_time`
- Real positions tab populates when a trade is open
- Skew 1σ levels visible and correct on straddle chart

### Next

- Weekly straddle display — after first Monday of data
- ES overnight range + gap on `session_summary`
- `/charts` route — continuous time series: SPX/ES/VIX with metrics overlaid
- Real positions enhancements (multi-leg grouping, delta per leg)
- Conditional stats in `/analysis` (filter by skew regime, VIX1D/VIX, day of week, macro)

### Backlog

- OptionsDepth GEX API integration (when budget allows)
- DXFeed auth reconnect
- Holiday list in poller
- Mobile layout polish

---

## Key Conventions

- **Always ask for the current file before modifying** — Pedro makes visual tweaks between sessions
- **Timezones**: UTC stored, CT displayed, ET for market hours gating
- **Hooks own data, components own UI**
- **useLiveTick**: LiveDashboard level only, one WebSocket
- **todayRows**: always filter by today's ET date before computing metrics
- **es_basis**: only non-null on first straddle row of the day
- **Skew data**: only valid from April 2, 2026 onwards
- **VIX/VIX1D**: symbols `"VIX"` / `"VIX1D"`, always use `tick.last`
- **bar_time**: use `currentBarTime()` from `lib/market-hours.mjs`
- **Scheduling**: always `msUntilNextMinute()`, never fixed 60s timeouts
- **session_summary**: upsert with `onConflict: "date"` — safe to re-run
- **Opening price**: DXFeed Summary for ATM selection, Quote mid for spx_ref. FMP logged for comparison only
- **Real positions**: `balancesAndPositionsService.getPositionsList()` — not `accountsService`
- **ECharts**: used in `/analysis` charts only. Lightweight Charts used for live dashboard charts
- **Analysis session grouping**: done client-side in `AnalysisDashboard.tsx` from raw snapshots
