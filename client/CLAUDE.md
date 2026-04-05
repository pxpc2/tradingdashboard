# Vovonacci Dashboard

Personal SPX options monitoring dashboard. Real-time data from Tastytrade/DXFeed, stored in Supabase, displayed in Next.js.

---

## Stack

- **Poller**: Node.js (`server/poller.mjs`) on Railway — runs 9:30–16:00 ET weekdays
- **Database**: Supabase (PostgreSQL + Realtime)
- **Frontend**: Next.js (`client/`) with Tailwind, Lightweight Charts v5, TypeScript
- **Data source**: Tastytrade API via OAuth2 refresh token, DXFeed/DXLink WebSocket streaming

---

## Project Structure

```
server/
  poller.mjs              # Main polling loop, runs on Railway
  .env                    # CLIENT_SECRET, REFRESH_TOKEN, SUPABASE_URL, SUPABASE_ANON_KEY
                          # Railway mirrors these vars from its dashboard — no railway.json needed

client/app/
  page.tsx                # Server component — fetches today's straddle + session SSR, renders Dashboard
  layout.tsx
  globals.css
  types.ts                # Shared TypeScript types for all Supabase tables — never redeclare locally
  lib/
    supabase.ts           # Supabase client
  hooks/
    useStraddleData.ts    # Fetch + realtime for straddle_snapshots, exposes esBasis from first row
    useFlyData.ts         # Fetch + realtime for rtm_sessions + sml_fly_snapshots, exposes patchEntryMid
    useSkewData.ts        # Fetch + realtime for skew_snapshots
  components/
    Dashboard.tsx         # Top-level orchestrator — tab logic, layout, calls all three hooks
    StraddleView.tsx      # Straddle + SPX combined chart with implied move labels, PDH/PDL
    StraddleChart.tsx     # Lightweight Charts: dual-axis SPX line + straddle area, implied/PDH/PDL lines
    SkewView.tsx          # Skew metric labels + SkewChart
    SkewChart.tsx         # Lightweight Charts: skew area series
    SmlFlyView.tsx        # SML Fly session creation form + per-width charts + inline entry price edit
    FlyChart.tsx          # Lightweight Charts: fly mid area series
    PositionsView.tsx     # Scratchpad positions — manual legs, BSM Greeks, live quote refresh every 60s
    EsSpxConverter.tsx    # ES/SPX basis converter strip — basis read-only from DB, bidirectional toggle
    LiveIndicator.tsx     # Live dot in header — green/amber/red per source, tooltip with last timestamps
  api/
    quotes/route.ts       # POST {symbols} — streams live quotes via Tastytrade, returns bid/ask/mid
    chain/route.ts        # GET — fetches full SPXW option chain (expirations + strikes) for position builder
    pdhl/route.ts         # GET — fetches previous day high, low, close from Tastytrade daily candles
```

---

## Supabase Tables

```
straddle_snapshots   id, created_at, spx_ref, atm_strike, call_bid, call_ask,
                     put_bid, put_ask, straddle_mid, es_basis (nullable — only set on open cycle row)

rtm_sessions         id, created_at, sml_ref, sal_ref, widths (int[]), type ('call'|'put')

sml_fly_snapshots    id, created_at, session_id, width, mid, bid, ask

skew_snapshots       id, created_at, skew, put_iv, call_iv, atm_iv,
                     expiration_date, put_strike, call_strike

positions            id, created_at, label, is_active, notes

position_legs        id, created_at, position_id, expiration_date, strike,
                     opt_type, action, quantity, entry_price_mid, streamer_symbol
```

---

## Poller Behavior

- Connects to DXFeed WebSocket once at startup, keeps connection alive
- Runs `runCycle()` every 60 seconds via `setTimeout` chain
- **Open cycle** fires once per day at exactly 09:30:00–09:30:30 ET:
  - Uses SPX `Summary.openPrice` (not mid) as ATM strike reference
  - Also fetches `/ES` quote → computes `es_basis = ES_mid - SPX_mid`, stored on first straddle row
  - Resets `skewCycleCount` to 0
- **Skew** computed every 5th regular cycle (~5 min):
  - Finds nearest 30-day expiry, fetches ATM quotes first to get IV seed
  - Uses ATM IV as sigma estimate for 25-delta strike targeting
  - Multiple abort conditions: invalid quotes (bid≤0, ask≤bid, spread/mid>50%), IV out of bounds, skew out of bounds
- **SML Fly** stored each cycle if an active `rtm_sessions` row exists for today
- Does not know about market holidays — logs "Nenhuma opção SPXW encontrada" harmlessly on those days

---

## Auth / API

- Tastytrade uses OAuth2 refresh token flow. Env vars:
  - Server: `CLIENT_SECRET`, `REFRESH_TOKEN`
  - Client (Next.js API routes): `TASTY_CLIENT_SECRET`, `TASTY_REFRESH_TOKEN`
- Each Next.js API route (`/api/quotes`, `/api/pdhl`, `/api/chain`) spins up a fresh `TastytradeClient`, connects, fetches, disconnects. 15s timeout on all streaming calls.
- Refresh token will eventually expire — if API routes start returning 401, rotate the token.

---

## Target Tab Architecture (MKT / VOL / POS)

Planned reorganization to replace the current Straddle / SML Fly / Skew / Posições tabs.

### [MKT]

- SPX chart — implied high/low zones, PDH/PDL axis labels (existing, needs extraction from StraddleView)
- ES chart — PDH/PDL, overnight high/low, pharmDK levels (placeholder — not built yet)
- Inline metric strip: current straddle, implied move %, ATM IV, realized move %

### [VOL]

- Straddle chart with theoretical decay curve overlay — dashed BSM line computed from open IV
- Historical skew chart across multiple days (pending formula validation + data accumulation)
- Realized move % history chart (pending daily_summary table)

### [POS]

- Real positions from Tastytrade API — live P&L, portfolio Greeks aggregation (placeholder — not built yet)
- SML Fly tracker (existing SmlFlyView, moves here unchanged)
- Scratchpad positions (existing PositionsView, moves here unchanged)

---

## Current Status

### Working

- Straddle snapshots with SPX overlay, dual Y-axes, implied move zones, PDH/PDL
- SML Fly multi-width tracking, entry price inline editing, PnL
- Normalized 25-delta skew on ~30-day expiry, sanitized, throttled every 5 min
- Scratchpad positions with manual legs, BSM Greeks, live quote refresh every 60s
- ES/SPX basis converter strip — basis from open cycle, read-only, bidirectional toggle
- Live indicator dot with per-source freshness tooltip
- Date picker with full historical browsing
- Tall mode (all views stacked) / compact mode (tab-based)
- Clean hooks / view components / chart components / types separation

### Pending / In Progress

- Skew formula validation vs LiveVol (first real test upcoming)
- Implied move % should use prev close, not open SPX ref (pdhl route already returns close)
- SML Fly quote averaging to kill occasional bad prints at open/close
- Live indicator for Posições (written, not yet wired in Dashboard)
- ES/SPX converter input field reset on date change
- Tab restructure to MKT/VOL/POS (planned next — start with structure + placeholders)
- SPX chart and straddle chart need to be split into separate components before restructure

### Planned / Not Started

- ES chart with overnight candle data and pharmDK level inputs
- Straddle theoretical decay curve (BSM with open IV, plotted as dashed line)
- Historical skew chart (multi-day)
- Realized move % label and history chart
- Real Tastytrade positions component with live Greeks aggregation
- Holiday list in poller
- Daily summary table in Supabase for EOD metrics

---

## Key Conventions

See AGENTS.md for full coding conventions. Summary:

- **Timezones**: Supabase stores UTC. Frontend displays CT (America/Chicago). Market hours gated in ET (America/New_York).
- **Lightweight Charts**: Never use `display:none` on chart containers — use `visibility/height:0` to keep charts mounted and avoid remount bugs.
- **Data flow**: Hooks own all Supabase access. View components receive data as props only — no direct Supabase calls in components.
- **Types**: All shared types in `types.ts`. Never redeclare inline.
- **es_basis**: Only non-null on the first `straddle_snapshots` row of each day. Read via `straddleData[0]?.es_basis` in `useStraddleData`.
