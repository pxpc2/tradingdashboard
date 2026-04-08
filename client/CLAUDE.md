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
  page.tsx                # SSR initial data fetch, renders Dashboard
  layout.tsx              # Loads IBM Plex Sans + Mono, sets --font-sans/--font-mono vars
  globals.css             # .font-sans and .font-mono utility classes
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
    useFlyData.ts         # rtm_sessions + sml_fly_snapshots fetch+realtime, exposes patchEntryMid
    useSkewData.ts        # skew_snapshots fetch+realtime
    useEsData.ts          # es_snapshots fetch+realtime, 48hr UTC window, exposes lastEsTime
    usePharmLevels.ts     # pharm_levels fetch, parses weekly+daily content
    useLiveTick.ts        # DXFeed WebSocket, auto-reconnect, exports ES_STREAMER_SYMBOL
  components/
    Dashboard.tsx         # Orchestrator — thin topbar, underline tabs, date, sign-out, all hooks
    MktView.tsx           # SPX+ES charts, metric strip, ONH/ONL, pharm levels, % change
    VolView.tsx           # Straddle chart + skew chart + metrics
    PosView.tsx           # SML Fly + Scratchpad positions
    SpxChart.tsx          # Lightweight Charts line, implied H/L, PDH/PDL, live tick, watermark
    EsChart.tsx           # Lightweight Charts line, pharm levels, ONH/ONL, live tick, watermark
    StraddleChart.tsx     # Straddle area series (VOL tab)
    SkewChart.tsx         # Skew area series (VOL tab)
    FlyChart.tsx          # Fly area series (POS tab)
    SmlFlyView.tsx        # Fly session creation, per-width charts, inline entry edit
    PositionsView.tsx     # Scratchpad positions, BSM Greeks, live quotes
    EsSpxConverter.tsx    # Basis converter, bidirectional toggle, live basis from ticks
  api/
    quotes/route.ts       # POST — live quotes via Tastytrade
    chain/route.ts        # GET — SPXW option chain
    pdhl/route.ts         # GET — previous day H/L/close from Tastytrade candles
    dxfeed-token/route.ts # GET — returns dxLinkUrl + dxLinkAuthToken
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

positions            id, created_at, label, is_active, notes

position_legs        id, created_at, position_id, expiration_date, strike,
                     opt_type, action, quantity, entry_price_mid, streamer_symbol

es_snapshots         id, created_at, es_ref (close), open (nullable), high (nullable), low (nullable)
                     -- es_ref kept as column name for backward compat, represents close price
                     -- open/high/low populated from OHLC loop, null on old rows

spx_snapshots        id, created_at, open, high, low, close
                     -- populated by OHLC loop during RTH only
                     -- not yet used by frontend (future candlestick charts)

pharm_levels         id, created_at, updated_at, weekly_content (text), daily_content (text)
                     -- single row, edit directly in Supabase table editor
                     -- paste pharm's message directly, parser handles it client-side
```

All tables have RLS enabled. Anon read on all. Auth write on rtm_sessions, sml_fly_snapshots,
positions, position_legs, pharm_levels. Poller uses service role key (bypasses RLS).
Supabase project max rows setting: 15,000 (required for ES overnight data).

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
- ES (`/ESM26:XCME`): runs during globex hours, inserts into `es_snapshots` with open/high/low/close
- SPX: runs during RTH only, inserts into `spx_snapshots`
- 5s gap after 55s collection window = ~60s total per cycle

### ES Symbol

- Current: `/ESM26:XCME` (June 2026)
- Format: `/ES{month}{2-digit-year}:XCME`
- Month codes: H=Mar, M=Jun, U=Sep, Z=Dec
- Update quarterly — next roll: September 2026 → `/ESU26:XCME`

---

## Auth

- Supabase Auth email+password, single user
- Server actions for login/signOut in `client/app/login/actions.ts`
- Session managed via `@supabase/ssr` cookies
- `proxy.ts` (Next.js 16 middleware convention) checks session on every request
- Unauthenticated requests redirected to `/login`
- Frontend Supabase client uses `createBrowserClient` from `@supabase/ssr` — carries session for RLS

---

## UI Architecture

### Layout

- Thin 36px topbar (`border-b border-[#1a1a1a]`) — sticky, contains tabs + date + sign-out
- Tabs use underline indicator (`border-b-2 border-[#555]`) not pill/box style
- Sign-out is plain text "sair" — no icon
- Content area: `max-w-7xl mx-auto px-6 py-6`
- All three tab views (MKT/VOL/POS) stay mounted via `visibility/height:0` — never unmount

### Typography

- Labels: `font-sans text-[9px] text-[#444] uppercase tracking-widest`
- Values: `font-mono font-light text-xl text-[#9ca3af]`
- Metric strips: `flex-nowrap overflow-x-auto` — single line, scrolls horizontally, never wraps
- Pipe dividers between metrics: `w-px h-4 bg-[#1f1f1f]`

### Section headers

- Bloomberg-style left border accent: `w-0.5 h-4` colored `#4ade80` (open) or `#2a2a2a` (closed)
- Symbol label + live price + % change inline
- % change colored green (`#4ade80`) or red (`#f87171`)

### Dividers

- `border-[#222]` — slightly more visible than old `#1a1a1a`

---

## Live Basis

- `EsSpxConverter` receives `liveBasis` computed in `MktView` from live ticks
- `liveBasis = esTick.mid - spxTick.mid` when both ticks available
- Falls back to stored `esBasis` from open cycle when ticks unavailable

---

## PharmDK Levels

- Stored as raw text in `pharm_levels` table (single row)
- `weekly_content`: updated every Monday, persists all week
- `daily_content`: updated each morning, replaced daily
- Parsed client-side in `usePharmLevels` hook
- Parser handles: ranges (`6639-6645`), single levels (`6469`), asterisks (`*`), notes
- Single levels plot as one horizontal line
- Ranges plot as two horizontal lines (top + bottom of region)
- Weekly: dark blue (`#3b4f7a`), Daily: gray (`#444444`), both dashed width 2
- Only shown on today's date — hidden on past dates

---

## Overnight High/Low (ONH/ONL)

- Computed inline in `Dashboard.tsx` from `esData` — no state/effects needed
- Overnight window: globex open (23:00 UTC prev day = 18:00 ET) → RTH open (13:30 UTC = 09:30 ET)
- `rthOpen = selectedDate T13:30:00Z` — 09:30 ET = 13:30 UTC (ET is UTC-4 during DST)
- `globexOpen = rthOpen - 15.5 * 60 * 60 * 1000`
- Uses `high` column for ONH and `low` column for ONL (falls back to `es_ref` for old rows)
- Only shown during RTH (`isSpxOpen()`) on today's date
- Displayed as teal dashed lines (`#2a6b6b`) with axis labels ONH/ONL
- Passed from Dashboard → MktView → EsChart as props

---

## Key Conventions

See AGENTS.md for full coding conventions. Summary:

- **Timezones**: Supabase stores UTC. Frontend displays CT. Market hours gated in ET. RTH open = `T13:30:00Z` not `T14:30:00Z`.
- **Lightweight Charts**: Never use `display:none` on chart containers — use `visibility/height:0`.
- **Tab switching**: All views mounted at all times — visibility trick prevents chart/WebSocket destruction.
- **Data flow**: Hooks own all Supabase access. View components receive data as props only.
- **Types**: All shared types in `types.ts`. Never redeclare inline.
- **es_basis**: Only non-null on the first `straddle_snapshots` row of each day.
- **useEsData**: Uses 48hr UTC window + Supabase 15k row limit. No `.limit()` in code — controlled via Supabase dashboard setting.
- **createBrowserClient**: Must be used instead of `createClient` for RLS-authenticated browser writes.
- **ONH/ONL**: Computed inline during render in Dashboard, not in state/effects. Pure function of esData.
