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
    dxfeed.mjs            # getQuotes, getSpxOpenPrice, getSpxQuoteMid, getEsMid, collectOhlc, withTimeout
    bsm.mjs               # normalCDF, bsmPrice, bsmDelta, invertIV, findDeltaStrike, findTargetExpiry, isValidQuote
  loops/
    main.mjs              # runCycle, runAndScheduleNext, skew logic, SML fly
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
    StraddleSpxChart.tsx  # Straddle area + SPX line overlay — pending ECharts migration
    SkewHistoryChart.tsx  # All-time 5-min skew history, avg line, day separators — pending ECharts migration
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
  MktView.tsx           # Old MKT tab — replaced by LiveDashboard
  VolView.tsx           # Old VOL tab — merged into LiveDashboard
  PosView.tsx           # Old POS tab — merged into LiveDashboard
  SpxChart.tsx          # Contains day separator canvas overlay pattern — reference only
  EsChart.tsx           # ES line chart — no longer used
  StraddleChart.tsx     # Old straddle chart — replaced by StraddleSpxChart
  SkewChart.tsx         # Old skew chart — replaced by SkewHistoryChart
  Watchlist.tsx         # Old vertical watchlist — replaced by WatchlistStrip
hooks/
  usePharmLevels.ts     # Pharm levels — no longer used
  useSkewData.ts        # Old skew hook — replaced by useSkewHistory
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
```

`bar_time` = UTC ISO timestamp of the minute boundary the bar belongs to.
All tables have RLS enabled. Anon read on all. Auth write on rtm_sessions, sml_fly_snapshots,
positions, position_legs. Poller uses service role key (bypasses RLS).

---

## Poller Architecture

Entry point: `server/poller.mjs` — connects DXLink, starts two loops, handles SIGINT.

### Wall-Clock Anchoring (critical)

Both loops use `msUntilNextMinute()` to anchor scheduling to wall-clock boundaries.
This means drift self-corrects every cycle — never use fixed `setTimeout(fn, 60000)`.

`currentBarTime()` snapshots the minute boundary before collection begins so `bar_time`
is always a clean UTC minute regardless of how long the cycle takes.

### `runAndScheduleNext()` — loops/main.mjs

- RTH only (09:30–16:00 ET weekdays)
- **Open cycle** at 09:30:00–09:30:30 ET: SPX open price, ES basis, resets skewCycleCount
- Each cycle: chain fetch → SPX quote → ATM straddle → `straddle_snapshots` insert
- Skew every 5th cycle (~5 min) → `skew_snapshots` insert
- SML Fly if active `rtm_sessions` row exists for today
- Schedules next via `msUntilNextMinute()`

### `runOhlcLoop()` — loops/ohlc.mjs

- Runs independently, parallel to main cycle
- Collects 55s of ticks, inserts with `bar_time`, schedules at next minute minus 5s
- **Quote symbols** (bid/ask mid): ES (`/ESM26:XCME`), SPX
- **Trade symbols** (Trade event `price`): VIX, VIX1D — bid/ask are 0 for indices
- ES → `es_snapshots` (globex hours)
- SPX → `spx_snapshots` (RTH only)
- VIX + VIX1D → `vix_snapshots` / `vix1d_snapshots` (any open session)

### ES Symbol

- Current: `/ESM26:XCME` (June 2026)
- Next roll: September 2026 → `/ESU26:XCME`
- Format: `/ES{month}{2-digit-year}:XCME` (H=Mar, M=Jun, U=Sep, Z=Dec)

---

## UI Architecture

### LiveDashboard Layout

Single-view, always-live. No tabs, no date picker.

```
┌──────────────────────────────────────────────────────────────┐
│ HEADER: WatchlistStrip ticker (SPX, ES + all) | Basis | OUT  │
├──────────────────────────────────────────────────────────────┤
│ WORLD CLOCK: CHI ET-1 | NY ET+0 | BSB ET+1 | LDN ET+5       │
├──────────────────────────────────────────────────────────────┤
│ SPX 6819.95 +0.04%  │  ES 6863.88 +0.01%  │  VIX 19.23      │
│ STRADDLE | IMPLIED | REALIZED | IV30 | SKEW | CALL IV/PUT IV  │
├──────────────────────┬───────────────────────────────────────┤
│ Straddle + SPX chart │ Skew History (all-time 5-min)         │
├──────────────────────┴───────────────────────────────────────┤
│ Macro Events (CT)    │ Positions (SML Fly / Real)            │
└──────────────────────────────────────────────────────────────┘
```

### Key Design Decisions

- Watchlist: auto-scrolling ticker, SPX+ES first, pauses on hover
- World clock: CHI/NY/BSB/LDN, ET-relative offset, DST-aware
- VIX: `tick.last`, same % change logic as SPX/ES
- Charts: pending migration to Apache ECharts (currently Lightweight Charts v5)
- Skew chart: canvas overlay day separators, `rightOffset: 10`
- UI language: Portuguese labels

### Planned Chart Migration — Apache ECharts

`StraddleSpxChart` and `SkewHistoryChart` migrating to ECharts for:

- Candlestick support (future 1-min charts)
- Cleaner dual Y-axis
- Native markLine/markArea (replaces canvas separator hack)
- Built-in DataZoom

Migration order: SkewHistoryChart → StraddleSpxChart → new candle charts (ES, SPX, VIX, VIX1D)

### Typography

- Labels: `font-sans text-xs text-[#555] uppercase tracking-wide`
- Values: `font-mono text-lg text-[#9ca3af] font-light`
- Section headers: Bloomberg-style left border accent (`w-0.5 h-5`)

---

## Live Ticks — useLiveTick

- Called once in `LiveDashboard.tsx` only — one WebSocket
- `TickData`: `{ bid, ask, mid, prevClose, last }`
- VIX/VIX1D: use `tick.last` (bid/ask/mid are 0 for indices)
- Auto-reconnects every 5s on close

---

## WatchlistStrip

- Items rendered twice for seamless loop: `[...entries, ...entries]`
- `translateX(0)` → `translateX(-50%)` animation, `:hover` pauses
- Edge fade via `maskImage` gradient
- Price: `mid === 0 ? last : mid`
- Speed: animation duration (80s currently)

---

## Skew History — useSkewHistory

- Fetches ALL `skew_snapshots >= '2026-04-02'`
- Returns: `{ skewHistory, latestSkew, avgSkew, isLoading }`
- Realtime appends new rows

---

## WorldClock

- CHI / NY / BSB / LDN
- ET offset via `Intl` — DST-aware, never hardcoded
- Hover highlights amber (`#f59e0b`)

---

## % Change

- SPX/ES/VIX: `tick.prevClose` from DXFeed Summary
- VIX % may show 0.00% outside RTH (last === prevClose at that point)
- Watchlist: per-symbol `tick.prevClose`, dimmed when closed

---

## Pending / Planned

### Verify Monday open

- ES/SPX `bar_time` aligned to clean minute boundaries in Railway logs
- VIX/VIX1D rows appearing in `vix_snapshots` / `vix1d_snapshots`
- Main loop cycles aligning to wall-clock minutes
- Skew every 5th cycle still firing

### Next — frontend

- ECharts migration: SkewHistoryChart first, then StraddleSpxChart
- 1-min candle charts: ES, SPX, VIX, VIX1D

### Next — poller

- `session_summary` table — one row per trading day (open straddle, skew, realized move, etc.)
- VIX1D/VIX ratio at open
- ES overnight range + gap

### Dashboard features

- VIX1D/VIX ratio in metrics strip
- Skew percentile vs history
- Realized vol tracker (5d/10d/21d vs IV30)
- Opening range markers on straddle chart
- Term structure panel (VX curve)

### Backlog

- Native GEX (chain + OI every 30min)
- Real Tastytrade positions with P&L
- `/history` route
- Holiday list in poller
- DXFeed auth reconnect
- Mobile polish
- Threshold alerts

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
