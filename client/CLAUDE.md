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
    main.mjs              # runCycle, runAndScheduleNext, skew, SML fly, session_summary open/close
    ohlc.mjs              # runOhlcLoop — wall-clock anchored, bar_time, ES+SPX+VIX+VIX1D

client/app/
  page.tsx                # SSR initial data fetch, renders LiveDashboard
  layout.tsx              # Loads IBM Plex Sans + Mono, sets --font-sans/--font-mono vars
  globals.css             # Scrollbar styles, .scrollbar-none utility
  types.ts                # ALL shared types — never redeclare locally
  proxy.ts                # Auth middleware (Next.js 16 uses proxy not middleware)
  lib/
    supabase.ts           # createBrowserClient — session-aware, used in hooks/components
    supabase-server.ts    # createSupabaseServerClient — used in server actions + page.tsx
    supabase-middleware.ts # updateSession — used in proxy.ts
  login/
    page.tsx              # Server component login page
    actions.ts            # login() and signOut() server actions
    SubmitButton.tsx      # useFormStatus loading spinner
  hooks/
    useStraddleData.ts    # straddle_snapshots fetch+realtime, exposes esBasis
    useFlyData.ts         # rtm_sessions + sml_fly_snapshots fetch+realtime
    useSkewHistory.ts     # All skew_snapshots >= April 2, 2026 (skew calc fix date)
    useEsData.ts          # es_snapshots fetch+realtime, today only
    useLiveTick.ts        # DXFeed WebSocket, Quote+Summary+Trade events, exports TickData
    useWatchlist.ts       # Fetches Vovonacci watchlist entries from /api/watchlist
    useMacroEvents.ts     # Fetches FMP economic calendar for selected date
  components/
    LiveDashboard.tsx     # Main orchestrator — single-view, always-live dashboard
    WorldClock.tsx        # 4-city clock row (CHI, NY, BSB, LDN) with ET-relative offset
    StraddleSpxChart.tsx  # Straddle area + SPX line overlay + skew-adjusted 1σ levels
    SkewHistoryChart.tsx  # All-time 5-min skew history, avg line, day separators
    PositionsPanel.tsx    # SML Fly / Real toggle, Lightweight Charts mini chart, input form
    WatchlistStrip.tsx    # Auto-scrolling ticker strip in header (SPX + ES + watchlist)
    MacroEvents.tsx       # FMP economic calendar, auto-scroll, CT times, flex height
    Converter.tsx         # Basis converter, bidirectional, compact prop for topbar
  api/
    quotes/route.ts       # POST — live quotes via Tastytrade SDK
    chain/route.ts        # GET — SPXW option chain
    pdhl/route.ts         # GET — previous day H/L/close from Tastytrade candles
    dxfeed-token/route.ts # GET — returns dxLinkUrl + dxLinkAuthToken
    macro-events/route.ts # GET — FMP economic calendar, US only, UTC→CT, cached
    watchlist/route.ts    # GET — Vovonacci watchlist, futures resolved to front month
```

### Deprecated Files (kept for reference)

```
components/
  Dashboard.tsx         # Old tab-based orchestrator
  MktView.tsx / VolView.tsx / PosView.tsx  # Old tab views — merged into LiveDashboard
  SpxChart.tsx          # Contains day separator canvas overlay pattern — reference only
  EsChart.tsx / StraddleChart.tsx / SkewChart.tsx / Watchlist.tsx  # Replaced
hooks/
  usePharmLevels.ts / useSkewData.ts  # No longer used
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
                     -- NOTE: Only data >= 2026-04-02 is valid (skew calc fixed April 1)

positions            id, created_at, label, is_active, notes
position_legs        id, created_at, position_id, expiration_date, strike,
                     opt_type, action, quantity, entry_price_mid, streamer_symbol

es_snapshots         id, created_at, bar_time, es_ref (close), open, high, low
spx_snapshots        id, created_at, bar_time, open, high, low, close
vix_snapshots        id, created_at, bar_time, open, high, low, close
vix1d_snapshots      id, created_at, bar_time, open, high, low, close

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

`bar_time` = UTC ISO timestamp of the minute boundary the bar belongs to.
All tables: RLS enabled, anon read, service role write (poller). Auth write on rtm_sessions, sml_fly_snapshots, positions, position_legs.

---

## Poller Architecture

Entry point: `server/poller.mjs` — connects DXLink, starts two loops, handles SIGINT.

### Wall-Clock Anchoring (critical)

Both loops use `msUntilNextMinute()` — drift self-corrects every cycle.
Never use fixed `setTimeout(fn, 60000)`.

`currentBarTime()` snapshots the minute boundary before collection so `bar_time` is always clean.

### `runAndScheduleNext()` — loops/main.mjs

- RTH only (09:30–16:00 ET weekdays)
- **Open cycle** at 09:30:00–09:30:30 ET:
  - Fetches SPX open price from both DXFeed (Summary + Quote) and FMP (09:30 1min bar)
  - Logs both refs + diff + whether ATM strike selection differs — for validation
  - Fetches ES basis
  - After straddle insert: calls `writeOpenSummary()` (fire-and-forget)
- Each cycle: chain → SPX quote → ATM straddle → `straddle_snapshots`
- Skew every 5th cycle (~5 min) → `skew_snapshots`
- SML Fly if active `rtm_sessions` row exists for today
- **Close cycle** at 16:00–16:01 ET: calls `writeCloseSummary()` (fire-and-forget)
- Schedules next via `msUntilNextMinute()`

### Session Summary — loops/main.mjs

**`writeOpenSummary()`** — fires after open cycle:

- Fetches VIX + VIX1D spot via `getIndexLast()` (Trade events)
- Checks FMP calendar for high-impact US events → `has_high_impact_macro`
- Queries first skew snapshot of today (may be null at 09:30, populated by ~09:35)
- Upserts `session_summary` row with all opening fields

**`writeCloseSummary()`** — fires at 16:00 ET:

- Reads today's `straddle_snapshots` → computes realized move, max intraday, closing straddle
- Reads today's `skew_snapshots` → closing skew, skew direction (up/down/flat, threshold 0.005)
- Upserts `session_summary` row with all closing fields

Both are fire-and-forget (`.catch` wrapped) — never block the main cycle.

### Opening Price Validation (ongoing)

Every open cycle logs:

```
🔔 OPEN CYCLE — fetching SPX opening price
   DXFeed Summary.openPrice : 6819.50
   DXFeed Quote mid         : 6820.25
   FMP 09:30 bar            : O:6819.75 H:6821.00 L:6818.50 C:6820.00
   ATM strike (DXFeed)      : 6820
   FMP open price           : 6819.75
   DXFeed vs FMP diff       : 0.50 pts
   ATM strike (FMP)         : 6820 ✓ same
```

Currently uses DXFeed as before. FMP is observational only — compare after several sessions to decide which is more reliable.

### `runOhlcLoop()` — loops/ohlc.mjs

- Independent loop, parallel to main
- 55s collection → insert with `bar_time` → schedule at next minute minus 5s
- **Quote symbols** (bid/ask mid): ES, SPX
- **Trade symbols** (Trade event `price`): VIX, VIX1D
- ES → `es_snapshots` (globex), SPX → `spx_snapshots` (RTH), VIX+VIX1D → their tables (any open session)

### DXFeed Helpers — lib/dxfeed.mjs

- `getQuotes(symbols)` — Quote events, bid/ask based
- `getSpxOpenPrice()` — Summary.openPrice + Quote mid at open
- `getSpxQuoteMid()` — Quote mid
- `getEsMid(symbol)` — Quote mid for futures
- `getIndexLast(symbol)` — Trade event last price for indices (VIX, VIX1D)
- `collectOhlc(quoteSymbols, tradeSymbols, durationMs)` — OHLC collection, split by event type
- `withTimeout(promise, ms, label)` — wraps any promise with a timeout

### ES Symbol

- Current: `/ESM26:XCME` (June 2026)
- Next roll: September 2026 → `/ESU26:XCME`
- Format: `/ES{H|M|U|Z}{2-digit-year}:XCME`

---

## UI Architecture

### LiveDashboard Layout

Single-view, always-live. No tabs. Date override via `?date=YYYY-MM-DD` URL param (dev only).

```
┌──────────────────────────────────────────────────────────────┐
│ HEADER: WatchlistStrip ticker (SPX, ES + all) | Converter | OUT │
├──────────────────────────────────────────────────────────────┤
│ WORLD CLOCK: CHI ET-1 | NY ET+0 | BSB ET+1 | LDN ET+5       │
├──────────────────────────────────────────────────────────────┤
│ SPX +0.04%  │  ES +0.01%  │  VIX  │  VIX1D                  │
│ STRADDLE | IMPLIED | REALIZED | IV30 | SKEW | CALL/PUT IV | VIX1D/VIX │
├──────────────────────┬───────────────────────────────────────┤
│ Straddle+SPX chart   │ Skew History (all-time 5-min)         │
│ + skew 1σ levels     │ avg line + day separators             │
├──────────────────────┴───────────────────────────────────────┤
│ Macro Events (CT)    │ Positions (SML Fly / Real)            │
└──────────────────────────────────────────────────────────────┘
```

### Key Design Decisions

- Watchlist: auto-scrolling ticker, SPX+ES first, pauses on hover, 80s cycle
- World clock: CHI/NY/BSB/LDN, ET-relative offset, DST-aware, hover amber
- VIX + VIX1D shown alongside SPX/ES — all use `tick.last`
- VIX1D/VIX ratio in metrics strip — amber when ≥ 1 (today more volatile than 30d baseline)
- Skew-adjusted 1σ levels on straddle chart — asymmetric upside/downside from opening put_iv/call_iv
- Skew chart: Lightweight Charts, canvas overlay day separators, `rightOffset: 80`
- UI language: Portuguese labels
- `?date=YYYY-MM-DD` param overrides today for dev/testing (requires Suspense boundary in page.tsx)

### Skew-Adjusted 1σ Levels — StraddleSpxChart

Computed from the first skew snapshot of today (`openingSkew` prop from LiveDashboard):

```
downsidePts = opening.spx_ref * openingSkew.put_iv * sqrt(1/252)
upsidePts   = opening.spx_ref * openingSkew.call_iv * sqrt(1/252)

Downside level = opening.spx_ref - downsidePts  (red dashed, left axis)
Upside level   = opening.spx_ref + upsidePts    (green dashed, left axis)
```

Lines are fixed at open — anchored to `data[0]`, not updated as skew changes.
Titles show point distance: `↓65`, `↑38`.
Lines are semi-transparent (`#f8717166`, `#4ade8066`).

### Typography

- Labels: `font-sans text-xs text-[#555] uppercase tracking-wide`
- Values: `font-mono text-lg text-[#9ca3af] font-light`
- Section headers: Bloomberg-style left border accent (`w-0.5 h-5`)

---

## Live Ticks — useLiveTick

- Called once in `LiveDashboard.tsx` only — one WebSocket
- `TickData`: `{ bid, ask, mid, prevClose, last }`
- VIX/VIX1D: always use `tick.last` (bid/ask/mid are 0 for indices)
- Auto-reconnects every 5s on close

---

## WatchlistStrip

- Items rendered twice for seamless loop
- `translateX(0)` → `translateX(-50%)`, `:hover` pauses, 80s cycle
- Edge fade via `maskImage` gradient
- Price: `mid === 0 ? last : mid`
- SPX and ES always prepended as static entries

---

## Skew History — useSkewHistory

- Fetches ALL `skew_snapshots >= '2026-04-02'`
- Returns: `{ skewHistory, latestSkew, avgSkew, isLoading }`
- Realtime appends new rows

---

## % Change

- SPX/ES/VIX/VIX1D: `tick.prevClose` from DXFeed Summary
- VIX/VIX1D % may show 0.00% outside RTH (last === prevClose)
- Watchlist: per-symbol `tick.prevClose`, dimmed when closed

---

## Pending / Planned

### Verify Monday open

- ES/SPX `bar_time` aligned to clean minute boundaries
- VIX/VIX1D rows in `vix_snapshots` / `vix1d_snapshots`
- `session_summary` row written at open and close
- DXFeed vs FMP open price diff logged — compare over several sessions
- Skew 1σ levels visible on straddle chart with correct values

### Next — analysis route

- `/analysis` route with:
  - Session summary table (all past sessions, sortable)
  - Implied vs realized scatter + ratio histogram
  - Straddle decay curve (avg normalized + live overlay)
  - IV30 vs realized vol (rolling 5d/10d/21d)
  - Conditional stats (filtered by skew regime, VIX1D/VIX, day of week, macro)

### Next — data collection

- Weekly straddle capture (Monday 09:30 ET, Friday expiry)
- ES overnight range + gap at open → add to session_summary
- Skew fields backfill in session_summary (update at 5th cycle when first skew is available)

### Dashboard features

- Skew percentile vs history
- Realized vol tracker display
- Opening range markers on straddle chart
- Term structure panel (VX curve)

### Backlog

- Native GEX (chain + OI every 30min)
- Real Tastytrade positions with P&L
- `/history` route
- Holiday list in poller
- DXFeed auth reconnect
- Mobile polish
- Threshold alerts (skew spike, straddle crosses level)
- ECharts migration (parked — revisit when building candle charts)

---

## Key Conventions

See AGENTS.md for full coding conventions. Critical reminders:

- **Always ask for the current file before modifying** — Pedro makes visual tweaks between sessions
- **Timezones**: UTC stored, CT displayed, ET for market hours gating
- **Hooks own data, components own UI**
- **useLiveTick**: LiveDashboard level only, one WebSocket
- **todayRows**: always filter by today's ET date before computing metrics
- **es_basis**: only non-null on first straddle row of the day
- **Skew data**: only valid from April 2, 2026 onwards
- **VIX/VIX1D**: symbols `"VIX"` / `"VIX1D"`, always use `tick.last`
- **bar_time**: use `currentBarTime()` from `lib/market-hours.mjs`, never hardcode
- **Scheduling**: always `msUntilNextMinute()`, never fixed 60s timeouts
- **session_summary**: upsert with `onConflict: "date"` — safe to re-run open/close writes
- **Opening price**: currently uses DXFeed Summary for ATM selection, Quote mid for spx_ref. FMP logged for comparison only — do not change source until validated over multiple sessions
- **Skew 1σ levels**: anchored to `data[0]` (opening snapshot) + first skew of today. Fixed for the day.
