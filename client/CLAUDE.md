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
    useSkewHistory.ts     # All skew_snapshots >= April 2, 2026 (skew calc fix date)
    useEsData.ts          # es_snapshots fetch+realtime, today only
    useLiveTick.ts        # DXFeed WebSocket, Quote+Summary+Trade events, exports TickData
    useWatchlist.ts       # Fetches Vovonacci watchlist entries from /api/watchlist
    useMacroEvents.ts     # Fetches FMP economic calendar for selected date
  components/
    LiveDashboard.tsx     # Main orchestrator — single-view, always-live dashboard
    WorldClock.tsx        # 4-city clock row (CHI, NY, BSB, LDN) with ET-relative offset
    StraddleSpxChart.tsx  # Straddle area + SPX line overlay (dual Y-axis)
    SkewHistoryChart.tsx  # All-time 5-min skew history with avg line + day separators
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

### LiveDashboard Layout (April 2026)

Single-view, always-live dashboard. No tabs, no date picker. Designed as companion panel alongside TradingView.

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
│ (area + line overlay)│ (avg line + day separators)           │
├──────────────────────┴───────────────────────────────────────┤
│ Macro Events (CT)    │ Positions (SML Fly / Real)            │
│ (scrollable, 220px)  │ (Lightweight Charts, 220px)           │
└──────────────────────────────────────────────────────────────┘
```

### Key Design Decisions

- **No date picker** — always shows live/today data
- **No tabs** — everything on one scrollable view
- **Watchlist in header** — auto-scrolling ticker strip, pauses on hover, SPX+ES always first
- **World clock** — CHI/NY/BSB/LDN abbreviations, ET-relative offset (ET+0, ET+1 etc), hover highlight
- **VIX** — shown alongside SPX and ES using `tick.last`, same % change logic
- **Charts** — all Lightweight Charts v5, interactive with crosshair
- **Skew chart** — day separator lines via canvas overlay, redraws on pan/zoom, right offset
- **Positions** — shows SML input form when no session exists
- **UI language** — Portuguese labels supported (e.g. "Calendário Econômico", "Posições", "Iniciar")

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
- VIX streamer symbol is `"VIX"` — use `tick.last` for display (bid/ask/mid are 0 for indices)

---

## WatchlistStrip

- Auto-scrolling horizontal ticker, pauses on hover
- SPX and ES always prepended as static entries (not fetched from Tastytrade)
- All entries show: symbol | price | % change
- Price logic: `mid === 0 ? last : mid` (consistent for all entries)
- % change dimmed when market is closed
- Edge fade via `maskImage` linear gradient
- Scroll speed controlled by animation duration (currently 80s)

---

## Skew History — useSkewHistory

- Fetches ALL `skew_snapshots` where `created_at >= '2026-04-02'`
- No date param — always returns full history
- Realtime subscription appends new rows
- Returns: `{ skewHistory, latestSkew, avgSkew, isLoading }`
- Chart has day separator lines drawn on canvas overlay, redraws on pan/zoom
- `rightOffset: 10` on timeScale for breathing room on latest day

---

## WorldClock

- Cities: CHI (America/Chicago), NY (America/New_York), BSB (America/Sao_Paulo), LDN (Europe/London)
- ET offset computed dynamically via `Intl` — DST-aware, never hardcoded
- Layout: two-column per card — left col has abbr + ET offset stacked, right col has time
- Hover highlights card in amber (`#f59e0b`)

---

## Watchlist API

- `GET /api/watchlist` → Tastytrade `GET /watchlists/vovonacci`
- Futures resolved to front-month active contract
- WatchlistEntry: `{ symbol, streamerSymbol, instrumentType, marketSector }`
- Open/closed: time-based per instrument type

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
- **VIX %**: `vixTick.prevClose` — accurate during RTH, may show 0.00% outside hours
- **Watchlist %**: `tick.prevClose` per symbol, dimmed when closed

---

## Pending / Planned

### Next up

- **Live straddle ticks** — stream ATM options to frontend for tick-by-tick straddle
- **Poller DXFeed auth reconnect** — stability fix for overnight sessions

### Data collection additions (accumulate for future analysis)

- VIX term structure daily snapshot (VX1–VX4 at close)
- IV/RV ratio log — daily computed and stored
- Skew at close — one clean daily value
- Macro event outcomes — actual vs estimate + SPX move after

### Backlog

- Real Tastytrade positions with live P&L
- `/history` route for historical analysis (multi-day charts, date picker)
- Native GEX calculation — chain + OI, stored every 30min
- Term structure panel — VX futures curve
- Skew percentile vs history
- Realized vol tracker — rolling 5d/10d/21d from ES OHLC vs IV30
- Holiday list in poller
- Mobile layout polish
- Threshold alerts (skew spike, straddle crosses level)

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
- **VIX**: streamer symbol is `"VIX"`, use `tick.last` not `tick.mid`
