# Vovonacci Dashboard

Personal SPX options monitoring dashboard. Tastytrade/DXFeed → Supabase → Next.js.

---

## Stack

- **Poller**: Node.js (`server/poller.mjs`) on Railway
- **Database**: Supabase (PostgreSQL + Realtime)
- **Frontend**: Next.js 16 with Tailwind 4, ECharts (primary), Lightweight Charts v5 (FlyMiniChart inside PositionsPanel only — pending migration), TypeScript
- **Auth**: Supabase Auth (email/password, single user); session via `@supabase/ssr` cookies; gated by `client/proxy.ts` (Next 16 uses `proxy.ts`, not `middleware.ts`)
- **Data sources**: Tastytrade API (OAuth2), DXFeed/DXLink WebSocket, FMP (macro calendar + market news), financialmodelingprep (sectors/movers)
- **Fonts**: IBM Plex Sans (UI) + IBM Plex Mono (numbers) via `next/font/google`
- **Brand**: "vovonacci·TERMINAL", Bloomberg-inspired muted palette, dense terminal aesthetic

---

## Project Structure

```
server/
  poller.mjs              # Entry — startup, signal handlers, DXLink reconnect watchdog
  lib/
    clients.mjs           # Supabase + Tastytrade singletons
    market-hours.mjs      # isMarketHours, isGlobexHours, msUntilNextMinute, currentBarTime
    dxfeed.mjs            # getQuotes, getSpxOpenPrice, getSpxQuoteMid, getEsMid, collectOhlc
    bsm.mjs               # BSM pricing, IV inversion, delta/strike helpers
    futures.mjs           # getFrontMonthEsSymbol() — Tastytrade-resolved, cached
  loops/
    main.mjs              # Straddle every minute, skew every 5, SML fly,
                          # session_summary, weekly straddle (Mondays)
    ohlc.mjs              # ES + SPX + VIX + VIX1D OHLC — wall-clock anchored

client/app/
  proxy.ts                # Auth gate (matcher excludes static; redirects /login when no user)
  (dashboard)/
    layout.tsx            # SSR auth + shared shell (TopHeader/TabNav/SecondaryTicker/MarketStatusFooter)
    live/page.tsx         # SSR straddle + weekly straddle → LiveTab
    positions/page.tsx    # SSR rtm session → PositionsTab
    chart/page.tsx        # Stub
    macro/page.tsx        # Stub
    analysis/             # Auth-protected, multi-session ECharts dashboard
  tradingplan/            # Auth-protected, URL-only (no nav link)
  page.tsx                # redirect("/live")
  globals.css             # Tailwind 4 @theme tokens
  types.ts                # Shared types — never redeclare locally
  lib/
    supabase.ts | supabase-server.ts | supabase-middleware.ts
    theme.ts              # THEME constants + cssVar() (effects only) + withOpacity()
    chartPalette.ts       # resolveChartPalette() — hex values for ECharts/canvas
    sessionCharacter.ts   # computePriceCharacter, computeSkewCharacter,
                          # classifySessionFinal, computeTags
  hooks/
    useStraddleData / useFlyData / useSkewHistory / useEsData
    useLiveTick           # Single DXFeed WS — call once per route (LiveTab, PositionsTab)
    useEsContract         # Resolves front-month ES symbol via /api/es-contract
    useWatchlist / useMacroEvents / useRealPositions
    useMarketNews / useMovers / useSectors
  components/
    TopHeader.tsx           # Brand + 4 timezones + SPX tick-age + CT clock + Converter
    TabNav.tsx              # LIVE | POSITIONS | CHART | MACRO | ANALYSIS
    SecondaryTicker.tsx     # Watchlist strip — SPX + ES auto-injected
    MarketStatusFooter.tsx  # NYSE / CBOE / GLBX status dots
    LiveTab.tsx             # /live orchestrator (owns the WebSocket)
    LiveReadPanel.tsx       # Narrative + tag pills + evidence line
    InstrumentCards.tsx     # SPX / ES / VIX / VIX1D 4-up
    MetricsGrid.tsx         # 8-cell vol/skew/range grid (no dealer)
    IntradayCharts.tsx      # StraddleSpx (2/3 width) + SkewHistory (1/3)
    StraddleSpxChart.tsx    # ECharts — Straddle area + SPX line + 1σ markLines
    SkewHistoryChart.tsx    # ECharts — multi-session skew, category axis
    Sectors.tsx             # SPDR sector ETFs grid
    TopMovers.tsx           # SP100 gainers/losers
    NewsWire.tsx            # FMP market news, animated new-row flash
    CalendarFixedHeight.tsx # Macro calendar (FMP)
    PositionsTab.tsx        # /positions orchestrator (owns its own WebSocket)
    PositionsSideBySide.tsx | PositionsPanel.tsx | PositionsFixedHeight.tsx
    Converter.tsx           # ES↔SPX basis converter (compact, lives in TopHeader)
  api/
    quotes / chain / pdhl / dxfeed-token / es-contract / watchlist
    real-positions / market-news / sectors / sp100-movers / macro-events
```

---

## Routes

| Route | Purpose |
| ----- | ------- |
| `/` | redirect → `/live` |
| `/live` | Today's straddle, skew, vol metrics, sectors, movers, news, calendar |
| `/positions` | Real Tastytrade positions + SML fly mini chart |
| `/chart` | Stub |
| `/macro` | Stub |
| `/analysis` | Multi-session analysis (auth-protected) |
| `/tradingplan` | Pre-market plan + condition log + post-session review (URL-only) |
| `/login` | Supabase Auth |

---

## Theme System

Single source of truth: `globals.css @theme`.

| Layer | Use for |
|-------|---------|
| Tailwind utilities (`bg-page`, `text-text-2`) | 90% of JSX |
| `THEME.xxx` from `lib/theme.ts` | Inline static semantic colors |
| `resolveChartPalette()` | ECharts/canvas inside `useEffect` only |

**Never hardcode hex.** Add tokens to `globals.css @theme` first, then export via `THEME` if reused.

**Opacity**: `withOpacity(THEME.up, 0.4)` → `color-mix(...)`. Never `${THEME.up}66`.

**SSR safety**: `cssVar()` reads computed DOM style → does not exist on server → hydration mismatch. In render, only use raw `"var(--color-name)"` strings; call `cssVar()` only inside `useEffect`.

### Palette

- **Foundation**: `page #0d0e11` · `panel #13151a` · `panel-2 #1a1d23` · `border #22252c` · `border-2 #2d3038`
- **Text**: 6-step warm gray (`text` → `text-6`)
- **Accents**: `amber #f5a524` · `indigo #7ea8c4`
- **Directional**: `up #7fc096` · `down #d0695e`
- **Regime** (analysis): `regime-trend` · `regime-partial` · `regime-reversal` · `regime-flat`
- **Skew character**: `skew-flat` · `skew-moving #9b7bb3` · `skew-strong`
- **Live read tones**: `tone-quiet` · `tone-normal` · `tone-attention` · `tone-alert`
- **Market status**: `status-open` · `status-closed`
- **SML fly widths**: `width-10` purple · `15` indigo · `20` amber · `25` teal · `30` coral
- **News impact**: `news-high` · `news-med` · `news-low`
- **Vestigial dealer tokens** (`gex-pos/neg`, `cex-pos/neg`, `wall-balance/test`, plus `-15` alpha variants): the dealer pipeline was removed; tokens remain in CSS but no component currently reads them. Safe to delete in a future cleanup.

---

## Supabase Tables

```
straddle_snapshots         id, created_at, spx_ref, atm_strike,
                           call_bid, call_ask, put_bid, put_ask,
                           straddle_mid, es_basis (open cycle row only)

skew_snapshots             id, created_at, skew, put_iv, call_iv, atm_iv,
                           expiration_date, put_strike, call_strike
                           -- Only data >= 2026-04-02 valid
                           -- skew = (put_iv - call_iv) / atm_iv

rtm_sessions               id, created_at, sml_ref, sal_ref, widths int[], type
sml_fly_snapshots          id, created_at, session_id, width, mid, bid, ask

es_snapshots               id, created_at, bar_time, es_ref, open, high, low
                           -- ~1380 rows/day. Filter: high/low not null && > 0
spx_snapshots              id, created_at, bar_time, open, high, low, close
vix_snapshots              id, created_at, bar_time, open, high, low, close
vix1d_snapshots            id, created_at, bar_time, open, high, low, close

weekly_straddle_snapshots  Monday open cycle only. Read by /live for weekly range.
                           Needs anon + auth read RLS.

session_summary            id, date (unique), opening/closing/realized/max_intraday cols,
                           has_high_impact_macro, day_of_week, etc.
                           Upsert onConflict: "date".

trading_plans              id, date (unique), skew_value, skew_pctile, vix1d_vix_ratio,
                           weekly_implied_move, spx_vs_weekly_atm, has_macro, macro_events,
                           opening_straddle, gamma_regime, balance_strikes, test_strikes,
                           vs3d_context, overnight_es_range, regime_score, regime_bias,
                           score_breakdown jsonb, condition_log jsonb[], actual_regime,
                           bias_was_correct, levels_held, trade_outcome, lesson,
                           accuracy_rating, closing_skew, skew_direction.
                           Upsert onConflict: "date".
```

**Removed**: `dealer_strike_snapshots` and `dealer_timeline_snapshots`. The QuantedOptions GEX/CEX pipeline (`server/loops/dealer.mjs`, `useDealerSnapshot`, dealer cells in MetricsGrid, GEX walls in StraddleSpxChart) was deleted from both server and client. Tables may still exist in Supabase but are not read or written.

**Supabase row cap**: project max-rows = **15000**. `es_snapshots` reaches this in ~10 days. All large analysis queries need explicit `.limit(N)`.

---

## Poller Architecture

Wall-clock anchoring — always `msUntilNextMinute()`, never fixed 60s timeouts. `currentBarTime()` snapshots the minute boundary before collection so `bar_time` is always a clean UTC minute regardless of cycle duration.

### `runAndScheduleNext()` — `loops/main.mjs`

- RTH only (09:30–16:00 ET, weekdays).
- **Open cycle** (09:30:15–09:30:45 ET): DXFeed Quote mid → first `straddle_snapshots` row with `es_basis`, plus `writeOpenSummary()`.
- **Each cycle**: chain fetch → SPX Quote mid → ATM straddle row.
- **Skew every 5th cycle**: → `skew_snapshots`.
- **SML fly**: if active `rtm_sessions` row exists for today, append `sml_fly_snapshots`.
- **Close cycle** (16:00–16:01 ET): `writeCloseSummary()`.
- **Weekly open cycle** (Mondays): `weekly_straddle_snapshots`.

### `runOhlcLoop()` — `loops/ohlc.mjs`

- Independent loop, parallel to main.
- 55s of DXFeed ticks → OHLC bar tagged with `currentBarTime()`.
- **Quote mid** (bid+ask)/2: ES (front-month, dynamic) + SPX (RTH only).
- **Trade last**: VIX + VIX1D (any open session — bid/ask are 0 for indices).

### ES Symbol

Resolved dynamically by `getFrontMonthEsSymbol()` in `server/lib/futures.mjs` (poller) and `/api/es-contract` + `useEsContract` (client). Both filter Tastytrade futures for `active=true && expiration-date > now && root-symbol === "/ES"`, sort by expiration ascending, pick `[0].streamer-symbol`. Server caches 1h or until 7 days before expiration. No hardcoded month.

### ATM strike

Always DXFeed Quote mid — never `Summary.openPrice`.

---

## LiveTab Layout

```
┌──────────────────────────────────────────────────────────────┐
│ TopHeader: brand · 4 zones · CT clock · Converter            │
├──────────────────────────────────────────────────────────────┤
│ TabNav: LIVE · POSITIONS · CHART · MACRO · ANALYSIS          │
├──────────────────────────────────────────────────────────────┤
│ SecondaryTicker (SPX, ES, watchlist)                         │
├──────────────────────────────────────────────────────────────┤
│ LiveReadPanel — narrative + tag pills + evidence line        │
│ InstrumentCards — SPX | ES | VIX | VIX1D                     │
│ MetricsGrid (8 cells, single row)                            │
│ IntradayCharts — StraddleSpx (2/3) | SkewHistory (1/3)       │
│ Sectors | TopMovers gainers | TopMovers losers (3-col)       │
│ NewsWire (2/3) | CalendarFixedHeight (1/3)                   │
├──────────────────────────────────────────────────────────────┤
│ MarketStatusFooter                                           │
└──────────────────────────────────────────────────────────────┘
```

### MetricsGrid (8 cells, no dealer)

| Cell | Notes |
|------|-------|
| STRADDLE MID | live; context = `OPENED $X.XX` |
| REALIZED | absolute pts; context = `XX% OF implied`; amber ≥70%, down ≥100% |
| SKEW | absolute value; context = `XX%ILE`; amber when ≥75 |
| IV30 · ATM | `atm_iv * 100` |
| VOL RATIO | VIX1D / VIX; amber ≥ 1.0 |
| VOL REGIME | VIX / VIX3M (>1 = backwardation = stress); amber ≥ 1.0 |
| DAILY RANGE | implied 1σ up\|down: `openingSpx ± openingStraddle × (call_iv or put_iv) / atm_iv` |
| WEEKLY RANGE | `weekly_atm ± weekly_straddle_mid` with expiry context |

### StraddleSpxChart

- `useUTC: true` + `toChartMs()` pre-shift → x-axis renders as CT.
- Two series: SPX (line, dashed `text-3`) + Straddle (area, `skew-moving`).
- Live SPX point appended only during `isRTH()` — no post-close diagonal.
- markLines: opening 1σ up/down based on `openingSkew.call_iv/atm_iv` and `put_iv/atm_iv`.
- Current SPX label: transparent markLine + `position: "start"` pill (left axis).
- Straddle: filled-pill `endLabel` (right axis).
- Props: `{ data, currentSpxPrice, openingSkew }`.

### SkewHistoryChart

- `type: "category"` x-axis — eliminates overnight/weekend voids.
- `indexMapRef`: ordinal index → UTC ms map for all formatters.
- Session breaks (gap > 30 min) → null point + `connectNulls: false`.
- Day separators: vertical markLines at session-start indices.
- `dataZoom`: inside (scroll=zoom, drag=pan) + slider.

---

## Live Read Framework

### Price (`computePriceCharacter`)

| Class | Condition |
|-------|-----------|
| `insufficient` | missing data |
| `flat` | magnitude < 0.3 |
| `trending` | character ≥ 0.7 |
| `partial_reversal` | character 0.4–0.7 |
| `reversal` | character < 0.4 |

- magnitude = `maxMove / openingStraddle`
- character = `|currentMove| / maxMove`
- held (evidence line) = `magnitude × character`

### Skew (`computeSkewCharacter`)

- `flat` < 0.008 · `moving` 0.008–0.015 · `strongly_moving` ≥ 0.015 (max excursion)
- Direction: `netChange > +0.003` → rising, `< -0.003` → falling

### Post-session (`classifySessionFinal`)

Magnitude ≥ 1.0 threshold for historical consistency.
Returns `Trend day` | `Trend with partial reversal` | `Reversal day` | `Flat day`.

### Narrative vocabulary (fixed — do not extend without discussion)

- **Price**: `AWAITING DATA` · `PRICE PINNED` · `TREND DAY ↑/↓` · `PARTIAL REVERSAL DAY` · `CHOPPY DAY`
- **Skew**: `FLAT SKEW` · `SKEW RISING` · `SKEW FALLING` · `SKEW RISING STRONG` · `SKEW FALLING STRONG`
- **Synthesis** (only for trending/reversal with non-flat skew):
  - price up + skew falling → `SKEW CONFIRMING`
  - price up + skew rising → `SKEW DIVERGING`
  - reversal mirrors above
  - flat skew or partial_reversal → no synthesis

### Tag pills (`computeTags`)

| Code | Fires when | Color |
|------|-----------|-------|
| `CONFIRMED-TREND` | trending + skew active | price direction |
| `UNCONFIRMED-TREND` | trending + skew flat | amber |
| `CONFIRMED-REVERSAL` | reversal + skew flat | indigo |
| `UNCONFIRMED-REVERSAL` | reversal + skew active | amber |
| `FLAT-DAY` | flat + magnitude < 0.3 + character < 0.3 | indigo |
| `SKEW-RISING` | strongly_moving + rising | amber |
| `SKEW-FALLING` | strongly_moving + falling | indigo |
| `RV<IV` | ≥ 2h + flat + magnitude < 0.5 | indigo |

`TagContext = { price, skew, minutesSinceOpen }` only.

---

## Live Ticks — useLiveTick

- One WebSocket per route, called at the top of `LiveTab` and `PositionsTab`.
- `TickData = { bid, ask, mid, prevClose, last, delta, gamma, theta, vega, iv, lastUpdateMs }`.
- VIX / VIX1D / VIX3M: use `tick.last` (bid/ask are 0 for indices).
- Reconnects every 5s on close.
- Re-subscribes when symbol set changes (effect dep is `symbols.join(",")`).

---

## Trading Plan

URL-only route at `/tradingplan`. Pre-market section + condition log + post-session review.

Regime score inputs are **manually entered** (the dealer pipeline that auto-derived `gamma_regime` / `balance_strikes` / `test_strikes` was removed; those fields remain on `trading_plans` as user-editable text). Score is computed client-side from those plus `skew_pctile`, `vix1d_vix_ratio`, `overnight_es_range`. See AGENTS.md → Trading Plan Regime Scoring.

---

## Analysis Route

Auth-protected SSR. ECharts for all charts.

Components: `ImpliedVsRealized`, `RatioHistogram`, `DecayCurve`, `StraddleHistory`, `DayOfWeekBreakdown`, `MaxVsEod`, `SkewVsRealized`, `OvernightRange`, `VixVsRealized`, `WeeklyStraddle`.

**Overnight range window** (EDT = UTC−4): `prev T20:00:00Z` → `date T13:30:00Z`. Always filter ES bars: `high !== null && low !== null && high > 0 && low > 0`.

**Row cap**: Supabase max-rows = 15000. All large queries need `.limit(N)`. Pending: `fetchAll()` paginator + materialize derived metrics into `session_summary` so analysis stops recomputing on every visit.

---

## Key Conventions

- **Always ask for the current file before modifying** — visual tweaks happen between sessions.
- **Timezones**: stored UTC · displayed CT · gating ET · date strings ET (`en-CA`).
- **Hooks own data, components own UI.**
- **Hydration**: null on SSR, populate in `useEffect`. `queueMicrotask` for first-tick clock set (React 19).
- **Colors in render**: raw `"var(--color-name)"` strings only — never `cssVar()` in JSX.
- **No hardcoded hex** — add token to `globals.css @theme` first.
- **ECharts scatter**: always `emphasis: { focus: "series" }` + `blur: { itemStyle: { opacity: 0.12 } }`.
- **Upserts**: `session_summary` + `trading_plans` always `onConflict: "date"`.
- **VIX/VIX1D/VIX3M**: always `tick.last`.
- **Skew**: only valid >= 2026-04-02.
- **ES OHLC filter**: `high/low not null && > 0`.
- **Overnight UTC window**: `prev T20:00:00Z` → `date T13:30:00Z` (EDT). Never T21.
- **Supabase max-rows**: 15000 — all analysis queries need explicit `.limit()`.
- **ES symbol**: `getFrontMonthEsSymbol()` (server) / `useEsContract` (client). Never hardcode.
- **`weekly_straddle_snapshots`**: needs anon + auth read RLS policies.

---

## Pending

- Migrate FlyMiniChart from Lightweight Charts to ECharts.
- Build out CHART and MACRO tab content (currently stubs).
- Fill `session_summary` close-cycle enrichment (overnight range, skew change, move metrics).
- Analysis paginator (`fetchAll()`) + materialize derived metrics into `session_summary`.
- Holiday calendar in `market-hours.mjs` (no holiday gating today).
- Fix silent IV non-convergence in `bsm.mjs` `invertIV` (currently returns midpoint sigma on non-convergence — should return null and skip the row).
- Decide whether to drop the vestigial dealer color tokens from `globals.css`.
