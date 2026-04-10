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
  poller.mjs              # Main polling loop on Railway

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
    useSkewHistory.ts     # NEW: All skew_snapshots >= April 2, 2026 (skew calc fix date)
    useEsData.ts          # es_snapshots fetch+realtime, today only
    useLiveTick.ts        # DXFeed WebSocket, Quote+Summary+Trade events, exports TickData
    useWatchlist.ts       # Fetches Vovonacci watchlist entries from /api/watchlist
    useMacroEvents.ts     # Fetches FMP economic calendar for selected date
  components/
    LiveDashboard.tsx     # NEW: Main orchestrator — single-view, always-live dashboard
    WorldClock.tsx        # NEW: 4-city clock row (Chicago, NY, Brasília, London)
    StraddleSpxChart.tsx  # NEW: Straddle area + SPX line overlay (dual Y-axis)
    SkewHistoryChart.tsx  # NEW: All-time 5-min skew history with avg line
    PositionsPanel.tsx    # NEW: SML Fly / Real toggle, Lightweight Charts mini chart, input form
    WatchlistStrip.tsx    # NEW: Horizontal compact watchlist for header
    MacroEvents.tsx       # FMP economic calendar, auto-scroll, CT times, flex height
    Converter.tsx         # Basis converter, bidirectional, compact prop for topbar
    FlyChart.tsx          # Fly area series (legacy, replaced by PositionsPanel mini chart)
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
  SpxChart.tsx          # SPX line chart — no longer used (TradingView handles SPX/ES)
  EsChart.tsx           # ES line chart — no longer used
  StraddleChart.tsx     # Old straddle chart — replaced by StraddleSpxChart
  SkewChart.tsx         # Old skew chart — replaced by SkewHistoryChart
  Watchlist.tsx         # Old vertical watchlist — replaced by WatchlistStrip
hooks/
  usePharmLevels.ts     # Pharm levels — no longer used (no ES chart)
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

es_snapshots         id, created_at, es_ref (close), open, high, low

spx_snapshots        id, created_at, open, high, low, close
```

All tables have RLS enabled. Anon read on all. Auth write on rtm_sessions, sml_fly_snapshots,
positions, position_legs. Poller uses service role key (bypasses RLS).

---

## Poller Behavior

Two independent loops run in parallel after startup:

### `runAndScheduleNext()` — main options cycle, every 60s

- RTH only (09:30–16:00 ET weekdays)
- **Open cycle** fires once per day at 09:30:00–09:30:30 ET:
  - Uses SPX `Summary.openPrice` for ATM strike reference
  - Fetches ES basis (`ES_mid - SPX_mid`), stored on first straddle row
  - Resets `skewCycleCount`
- Each cycle: fetches option chain, SPX quote, ATM straddle quotes → inserts `straddle_snapshots`
- Skew computed every 5th cycle (~5 min) → inserts `skew_snapshots`
- SML Fly quotes fetched and inserted if active `rtm_sessions` row exists for today

### `runOhlcLoop()` — OHLC collection, every ~60s

- Runs independently, parallel to main cycle
- Collects 55 seconds of live ticks for active symbols
- ES (`/ESM26:XCME`): runs during globex hours, inserts into `es_snapshots`
- SPX: runs during RTH only, inserts into `spx_snapshots`

### ES Symbol

- Current: `/ESM26:XCME` (June 2026)
- Format: `/ES{month}{2-digit-year}:XCME`
- Month codes: H=Mar, M=Jun, U=Sep, Z=Dec
- Next roll: September 2026 → `/ESU26:XCME`

---

## UI Architecture

### New LiveDashboard Layout (April 2026)

Single-view, always-live dashboard. No tabs, no date picker. Designed as companion panel alongside TradingView.

```
┌──────────────────────────────────────────────────────┐
│ HEADER: Watchlist (scrollable) | Basis | Converter | out │
├──────────────────────────────────────────────────────┤
│ WORLD CLOCK: Chicago | New York | Brasília | London      │
├──────────────────────────────────────────────────────┤
│ SPX 6816.87 +0.50%  │  ES 6867.38 +0.06%                 │
│ STRADDLE $1.20 | IMPLIED $31.30 | REALIZED 41.4pts (132%)│
│ IV30 15.6 | SKEW 0.4380 | CALL IV / PUT IV 12.0 / 18.9   │
├──────────────────────┬───────────────────────────────────┤
│ Straddle + SPX chart │ Skew History (all-time 5-min)     │
│ (area + line overlay)│ (with avg line)                   │
├──────────────────────┴───────────────────────────────────┤
│ Macro Events (CT)    │ Positions (SML Fly / Real)        │
│ (scrollable, 220px)  │ (Lightweight Charts, 220px)       │
└──────────────────────────────────────────────────────────┘
```

### Key Design Decisions

- **No date picker** — always shows live/today data
- **No tabs** — everything on one scrollable view
- **Watchlist in header** — horizontal strip with hidden scrollbar
- **World clock** — hover to highlight any city (no permanent highlight)
- **Charts** — all Lightweight Charts v5, interactive with crosshair
- **Positions** — shows SML input form when no session exists

### Typography

- Labels: `font-sans text-xs text-[#555] uppercase tracking-wide`
- Values: `font-mono text-lg text-[#9ca3af] font-light`
- Section headers: Bloomberg-style left border accent (`w-0.5 h-5`)
- Open/closed indicator: `#4ade80` (green) or `#2a2a2a` (dark)

### Scrollbar Styles

```css
::-webkit-scrollbar {
  width: 2px;
  height: 4px;
}
.scrollbar-none {
  /* hides scrollbar, keeps scroll */
}
```

---

## Live Ticks — useLiveTick

- Called once in `LiveDashboard.tsx` — one persistent WebSocket for all symbols
- Subscribes to **Quote + Summary + Trade** for every symbol
- `TickData`: `{ bid, ask, mid, prevClose, last }`
- Auto-reconnects every 5s on close
- Symbols = core (`SPX`, `/ESM26:XCME`) + all watchlist streamer symbols

---

## Skew History — useSkewHistory

- Fetches ALL `skew_snapshots` where `created_at >= '2026-04-02'`
- No date param — always returns full history
- Realtime subscription appends new rows
- Returns: `{ skewHistory, latestSkew, avgSkew, isLoading }`
- Used for all-time skew chart and IV30/Skew/Call IV/Put IV metrics

---

## Watchlist

- `GET /api/watchlist` → Tastytrade `GET /watchlists/vovonacci`
- Displayed in header as horizontal `WatchlistStrip`
- Open/closed: time-based per instrument type. Green/red left border
- Display: `mid` for equities/futures, `last` for indices (VIX etc)

---

## Macro Events

- `GET /api/macro-events?date=YYYY-MM-DD` → FMP economic calendar
- Auto-scrolls to next upcoming event, updates every 30s
- Auction: blue dot. High: red. Medium: amber. Low: dim.
- Flex height to match Positions panel

---

## % Change

- **SPX %**: `spxTick.prevClose` from DXFeed Summary
- **ES %**: `esTick.prevClose` from DXFeed Summary
- **Watchlist %**: `tick.prevClose` per symbol (TODO: add to WatchlistStrip)

---

## Pending / Planned

### Next up

- **Watchlist % change** — add to WatchlistStrip display
- **Live straddle ticks** — stream ATM options to frontend for tick-by-tick straddle

### Backlog

- Real Tastytrade positions with live P&L
- `/history` route for historical analysis (multi-day charts, date picker)
- Holiday list in poller
- Poller DXFeed auth reconnect

---

## Key Conventions

See AGENTS.md for full coding conventions. Critical reminders:

- **Always ask for the current file before modifying** — Pedro makes visual tweaks between sessions
- **Timezones**: UTC stored, CT displayed, ET for market hours gating
- **Hooks own data, components own UI**
- **useLiveTick**: LiveDashboard level only, one WebSocket
- **todayRows**: always filter by today's date before computing metrics
- **es_basis**: only non-null on first straddle row of the day
- **Skew data**: only valid from April 2, 2026 onwards
