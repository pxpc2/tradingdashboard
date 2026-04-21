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
- **Brand**: "vovonacci·TERMINAL", Bloomberg-inspired muted palette, dense terminal aesthetic

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
  (dashboard)/            # Route group — shared layout with TopHeader/TabNav/Ticker/Footer
    layout.tsx            # SSR auth + header + tabs + secondary ticker + footer
    live/page.tsx         # LIVE tab — SSR initial data, renders LiveTab
    positions/page.tsx    # POSITIONS tab (stub — Chunk 3)
    chart/page.tsx        # CHART tab (stub — Chunk 3)
    macro/page.tsx        # MACRO tab (stub — Chunk 3)
  page.tsx                # SSR initial data fetch, renders LiveDashboard (legacy / route)
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
                          # classifySessionFinal, buildLiveRead (legacy PT narration),
                          # computeTags (new English tag system),
                          # SESSION_TYPE_COLOR, SKEW_STRENGTH_COLOR, TONE_COLOR,
                          # resolveSessionTypeColors (canvas)
  login/
    page.tsx / actions.ts / SubmitButton.tsx
  analysis/
    page.tsx              # Auth-protected SSR
    AnalysisDashboard.tsx # Session grouping, SessionData type, filters
    components/           # ImpliedVsRealized, RatioHistogram, DecayCurve,
                          # StraddleHistory, DayOfWeekBreakdown, MaxVsEod,
                          # SkewVsRealized, OvernightRange, VixVsRealized, WeeklyStraddle
  tradingplan/
    page.tsx / TradingPlanDashboard.tsx
    components/           # PreMarketSection, ConditionLog, PostSessionReview, PlanHistoryTable
  hooks/
    useStraddleData.ts / useFlyData.ts / useSkewHistory.ts
    useEsData.ts / useLiveTick.ts / useWatchlist.ts
    useMacroEvents.ts / useRealPositions.ts
  components/
    # ── NEW TERMINAL UI (dashboard route group) ───────────────────────
    TopHeader.tsx           # Brand + 4 timezones (CHI/NY/BSB/LDN) + latency pill + CT clock
    TabNav.tsx              # LIVE/POSITIONS/CHART/MACRO tabs, amber underline active
    SecondaryTicker.tsx     # Watchlist strip, SPX+ES auto-injected, thin 3px scrollbar
    MarketStatusFooter.tsx  # NYSE/CBOE/GLBX open/closed dots
    LiveTab.tsx             # Main LIVE tab orchestrator (replaces LiveDashboard on /live)
    LiveReadPanel.tsx       # Hero panel: narrative + pills + evidence line
    InstrumentCards.tsx     # 4-up SPX/ES/VIX/VIX1D grid, status dot (green=open/coral=closed)
    MetricsGrid.tsx         # 2×3 grid: STRADDLE/IMPLIED/REALIZED + IV30/SKEW/VOL RATIO
    CharacterIvStructure.tsx # Side-by-side: CHARACTER (skew+price rows with numbers) + IV STRUCTURE bars
    IntradayCharts.tsx      # Side-by-side Straddle/SPX (left) + Skew history (right), no toggle
    PositionsSideBySide.tsx # 2-col wrapper: Real Positions (left) + SML Fly (right)
    CalendarFixedHeight.tsx # Compact macro calendar, sticky header, 260px fixed height
    # ── SHARED ────────────────────────────────────────────────────────
    PositionsPanel.tsx      # Real positions + SML Fly. lockedView?: "real"|"sml" prop
                            # When lockedView provided: no toggle, used by PositionsSideBySide
                            # When omitted: internal toggle, used by legacy LiveDashboard
    StraddleSpxChart.tsx    # Straddle + SPX + skew-adjusted 1σ levels (Lightweight Charts)
    SkewHistoryChart.tsx    # All-time skew, avg line, day separators (Lightweight Charts)
    # ── LEGACY (/ route, LiveDashboard) ───────────────────────────────
    LiveDashboard.tsx       # Original orchestrator — still active on / route
    WorldClock.tsx / WatchlistStrip.tsx / SkewCharacterBadge.tsx
    LiveReadLine.tsx        # Legacy PT narration, uses buildLiveRead()
    MacroEvents.tsx / Converter.tsx
  api/
    quotes/route.ts / chain/route.ts / pdhl/route.ts
    dxfeed-token/route.ts / macro-events/route.ts
    watchlist/route.ts / real-positions/route.ts
```

---

## Theme System

**Single source of truth: `globals.css` `@theme` block.**

Three layers of color access:

1. **Tailwind utility classes** (`bg-page`, `text-text-2`, `border-border`) — 90% of JSX
2. **`THEME` from `lib/theme.ts`** — CSS var references for inline styles: `style={{ color: THEME.amber }}`
3. **`resolveChartPalette()`** — resolved hex for ECharts/canvas (inside `useEffect`)

**Never hardcode hex.** Add tokens to `globals.css @theme` first.

**Opacity**: `withOpacity(THEME.up, 0.4)` → `color-mix(in srgb, var(--color-up) 40%, transparent)`. Never concat `${THEME.up}66`.

### Palette

**Foundation**: `page #0a0a0a` · `panel #121214` · `panel-2 #17171a` · `border #1f1f21` · `border-2 #2a2a2d`

**Text (6-step warm scale)**: `text #e8e6e0` → `text-2 #9a9890` → `text-3 #6e6c67` → `text-4 #555350` → `text-5 #44433f` → `text-6 #2f2e2c`

**Semantic (live — muted)**:

- `up #7fc096` sage / `down #d0695e` warm coral
- `amber #f5a524` — signature attention, used sparingly
- `indigo #7ea8c4` — reverting signal, secondary info

**Regime (analysis — punchy)**:

- `regime-trend #e55a3f` · `regime-partial #e6b84f` · `regime-reversal #5bb4a0` · `regime-flat #707070`

**Skew character**: `skew-flat #9a9890` / `skew-moving #9b7bb3` purple / `skew-strong #f5a524` amber

**SML fly widths**: 10→purple · 15→indigo · 20→amber · 25→teal · 30→coral

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
                     -- skew = (put_iv - call_iv) / atm_iv [25-delta risk reversal]
                     -- Missing normalization constant — used comparatively only

es_snapshots         id, created_at, bar_time, es_ref, open, high, low
                     -- open/high/low only populated after OHLC loop was added
                     -- always filter: e.high !== null && e.low !== null && e.high > 0 && e.low > 0
spx_snapshots / vix_snapshots / vix1d_snapshots   id, created_at, bar_time, open, high, low, close

weekly_straddle_snapshots   id, created_at, expiry_date, spx_ref, atm_strike, straddle_mid, etc.
                            -- Monday open cycle only
                            -- needs both anon read AND auth read RLS policies

session_summary      id, date (unique), opening_*, closing_*, realized_*, max_intraday_*,
                     has_high_impact_macro, day_of_week, spx_closed_above_open, skew_direction
                     -- opening_skew backfilled at close cycle from first skew snapshot

trading_plans        id, date (unique), skew_value, skew_pctile, vix1d_vix_ratio,
                     gamma_regime, balance_strikes, test_strikes, vs3d_context,
                     overnight_es_range, regime_score, regime_bias, score_breakdown (jsonb),
                     condition_log (jsonb[]), actual_regime, bias_was_correct,
                     closing_skew, skew_direction, lesson, accuracy_rating
```

---

## Session Character Framework

**Live classification** — `computePriceCharacter()` + `computeSkewCharacter()` in `sessionCharacter.ts`:

### Price axes

- **Magnitude** = `maxMove / openingStraddle` — how far price went, in straddle units
  - `< 0.3` → flat regardless of character
  - `~1.0` → realized what options priced
- **Character** = `|currentMove| / maxMove` — how much of the max move is still held
  - `≥ 0.7` → trending
  - `0.4–0.7` with magnitude ≥ 1.0 → partial reversal
  - `< 0.4` with magnitude ≥ 1.0 → reversal

**Evidence line display**: both expressed in straddle multiples (×). `held = magnitude × character` — so held is always ≤ peak visually.

### Price classifications (live)

| Classification     | Condition                           |
| ------------------ | ----------------------------------- |
| `insufficient`     | Not enough data yet                 |
| `flat` / PINNED    | magnitude < 0.3 AND character < 0.3 |
| `flat` / CHOPPY    | magnitude < 0.3 but some movement   |
| `trending`         | character ≥ 0.7                     |
| `partial_reversal` | magnitude ≥ 1.0, character 0.4–0.7  |
| `reversal`         | magnitude ≥ 1.0, character < 0.4    |

### Skew character

- `flat`: maxExcursion < 0.008
- `moving`: maxExcursion 0.008–0.015
- `strongly_moving`: maxExcursion ≥ 0.015
- Direction: netChange > +0.003 → rising, < -0.003 → falling

### Post-session classification

`classifySessionFinal(maxMovePct, eodMovePct)` → `SessionType`:

- "Trend day" / "Trend with partial reversal" / "Reversal day" / "Flat day"

---

## LIVE READ Panel

### Narrative phrases (full vocabulary — do not add new ones without discussion)

**Price** (priceNarrative):

- `AWAITING DATA` — insufficient
- `PRICE PINNED` — flat, mag < 0.3
- `PRICE CHOPPY` — flat, mag ≥ 0.3
- `PRICE TRENDING ↑` / `PRICE TRENDING ↓` — trending (arrow shows direction)
- `PRICE PARTIALLY REVERSING` — partial_reversal (no arrow — focus isn't direction)
- `PRICE REVERSED` — reversal (no arrow)

**Skew** (skewNarrative):

- `FLAT SKEW` — flat strength or flat direction
- `SKEW RISING` / `SKEW FALLING` — moving
- `SKEW RISING STRONG` / `SKEW FALLING STRONG` — strongly_moving

**Synthesis** (fires only for clear cases, appended after `—`):

- trending + skew active → `SKEW CONFIRMING`
- trending + skew flat → `SKEW DIVERGING`
- reversal + skew flat → `SKEW CONFIRMING`
- reversal + skew active → `SKEW DIVERGING`
- partial*reversal → *(no synthesis — price+skew phrases carry it)\_
- pinned/choppy/flat → _(no synthesis)_

### Evidence line

Three labeled metric clusters, font-mono text-[11px]:

```
PRICE {magnitude}× peak · {magnitude×character}× held {↑↓}    SKEW {currentSkew} · Δ{netChange} · {pctile}%ile    RV/IV {realizedPts}/{openingStraddle} pt · {pct}%
```

- Arrow hidden for partial_reversal and reversal states
- RV/IV pct turns THEME.down when ≥ 100% (realized exceeded implied)

### Tag pills (computeTags — LiveReadPanel right side)

Active tags (ordered by priority):

| Code                   | Fires when                      | Color                                    |
| ---------------------- | ------------------------------- | ---------------------------------------- |
| `CONFIRMED-TREND`      | trending + skew active          | THEME.up or THEME.down (price direction) |
| `UNCONFIRMED-TREND`    | trending + skew flat            | THEME.amber                              |
| `CONFIRMED-REVERSAL`   | reversal + skew flat            | THEME.indigo                             |
| `UNCONFIRMED-REVERSAL` | reversal + skew active          | THEME.amber                              |
| `FLAT-DAY`             | flat + mag < 0.3 + char < 0.3   | THEME.indigo                             |
| `SKEW-RISING`          | strongly_moving + rising        | THEME.amber                              |
| `SKEW-FALLING`         | strongly_moving + falling       | THEME.indigo                             |
| `RV<IV`                | ≥ 2h session + flat + mag < 0.5 | THEME.indigo                             |

Dropped tags (do not re-add): MACRO-DAY, PUT-IV-BID, CALL-IV-BID, VIX1D-HOT, VIX1D-COOL, PIN-RISK (renamed FLAT-DAY), VOL-CRUSH (renamed RV<IV), REVERSING (split into CONFIRMED/UNCONFIRMED-REVERSAL).

TagContext = `{ price: PriceCharacter, skew: SkewCharacter, minutesSinceOpen: number }` — nothing else.

---

## Character Panel Labels (CharacterIvStructure)

Three-column rows: `label (12px) | numbers (flex, 11px mono) | state (right, 14px bold colored)`.

**Skew state labels**: FLAT · RISING · FALLING · RISING STRONG · FALLING STRONG

**Price state labels**: — · PINNED · CHOPPY · TRENDING UP · TRENDING DOWN · PARTIAL REVERSAL · FULL REVERSAL

**Numbers**:

- Skew row: `Δ{netChange} · max {maxExcursion}` (raw skew units)
- Price row: `{maxMove.toFixed(1)}pt max · {currentMove.toFixed(1)}pt held {↑↓}` (raw points, arrow hidden for reversals)

---

## Hydration Rules

**All time-varying state must be null on SSR, populated in useEffect.**

Pattern (applied to TopHeader, MarketStatusFooter, LiveTab, any clock/status component):

```tsx
const [now, setNow] = useState<Date | null>(null);
useEffect(() => {
  setNow(new Date());
  const t = setInterval(() => setNow(new Date()), 1000);
  return () => clearInterval(t);
}, []);

// Render placeholder until mounted:
{
  now ? formatHMS("America/Chicago", now) + " CT" : "--:--:-- CT";
}
```

Never call `Date.now()`, `new Date()`, or `Math.random()` outside `useEffect`. Server HTML must equal initial client HTML.

---

## UI Layout — Terminal Shell

Route group `(dashboard)` wraps all tabs in a shared Bloomberg-style shell:

```
TopHeader       — sticky, z-50: brand + timezones + latency + CT clock + sign-out
TabNav          — LIVE / POSITIONS / CHART / MACRO, amber underline active, pb-1 gap
SecondaryTicker — SPX+ES auto-injected + watchlist, thin 3px scrollbar, manual scroll
[page content]
MarketStatusFooter — NYSE/CBOE/GLBX dots, green=open/coral=closed
```

**Padding convention**: all sections use `max-w-7xl mx-auto px-4 md:px-6`, matching header/footer. LiveTab wrapper uses `py-3 space-y-3`.

**Section borders**: each section uses `border border-border-2` (full outline box). Sections separated by `space-y-3`, not `border-b`.

**Font sizes** (consistent across all grid labels):

- Primary labels (STRADDLE, CHARACTER, SKEW, etc.): `text-xs` (12px) + `tracking-[0.05em]`
- Values: `text-base` or `text-xl` depending on prominence
- Sub-context (MID, OPEN, %ILE, etc.): `text-[9px]`
- Evidence / mono data: `text-[11px]`

**InstrumentCards**: status dot (●) is green=open / coral=closed. No OPEN/CLOSED pill. No bid/ask. Price at `text-xl`.

---

## Timezone Handling in Charts

Supabase stores UTC. All chart x-axes must display CT.

Lightweight Charts pattern (applied to FlyMiniChart, should also apply to StraddleSpxChart + SkewHistoryChart):

```typescript
timeScale: {
  tickMarkFormatter: (time: unknown) => {
    if (typeof time !== "number") return "";
    return new Date(time * 1000).toLocaleTimeString("en-US", {
      timeZone: "America/Chicago", hour: "2-digit", minute: "2-digit", hour12: false,
    });
  },
},
localization: {
  timeFormatter: (time: unknown) => {
    if (typeof time !== "number") return "";
    const d = new Date(time * 1000);
    return d.toLocaleDateString("en-US", { timeZone: "America/Chicago", month: "short", day: "numeric" })
      + " " + d.toLocaleTimeString("en-US", { timeZone: "America/Chicago", hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" }) + " CT";
  },
},
```

---

## Positions — PositionsPanel + PositionsSideBySide

`PositionsPanel` accepts optional `lockedView?: "real" | "sml"`:

- When provided: renders only that view, shows "Real Positions" or "SML Fly" as title, no toggle
- When omitted: internal Real↔SML toggle, backward-compatible with legacy `/` route

`PositionsSideBySide` renders two `PositionsPanel` instances side-by-side in `grid-cols-2`, 260px fixed height, each with `px-3 py-2` internal padding matching other sections.

---

## QuantEdge API Integration (Planned — Next Major Feature)

Trial signed up. Provides CBOE C1 dealer positioning data via REST API:

- **GEX** (Gamma Exposure) per strike — same core data as VS3D
- **DEX** (Delta Exposure) per strike
- **VEX** (Vega Exposure) per strike
- **CEX** (Charm Exposure) per strike — drives EOD pinning
- **Participant splits**: Market Maker / Firm / Broker-Dealer / Customer / Professional
- SPX + VIX, all strikes, all expiries, per-minute intraday + historical (04:00–16:15 ET)
- Polygon option prices bundled

**Planned integration**:

1. New Supabase table `dealer_positioning_snapshots` (polled at open + every 5min RTH)
2. `/api/dealer-positioning` Next.js route
3. New LIVE tab panel: GEX flip level + top GEX strikes + charm pin target
4. Morning framework auto-population (replaces manual VS3D slide reading)
5. Intraday GEX regime shift → potential new tag pill

**Replaces**: VS3D screenshot ingestion (Playwright automation approach, now deprioritized)

---

## Poller Architecture

### Wall-Clock Anchoring

Both loops use `msUntilNextMinute()` — never fixed `setTimeout(fn, 60000)`.

### `runAndScheduleNext()` — loops/main.mjs

- RTH only (09:30–16:00 ET weekdays)
- **Open cycle** at 09:30:15–09:30:45 ET: DXFeed Quote mid for `spx_ref` + ATM, calls `writeOpenSummary()` + `captureWeeklyStraddle()` (Monday only)
- Each cycle: chain → SPX Quote mid → ATM straddle → `straddle_snapshots`
- Skew every 5th cycle (~5 min) → `skew_snapshots`
- **Close cycle** at 16:00–16:01 ET: calls `writeCloseSummary()`
- ES symbol: `/ESM26:XCME` — next roll Sep 2026 → `/ESU26:XCME`

### `runOhlcLoop()` — loops/ohlc.mjs

- Quote symbols (bid/ask mid): ES, SPX
- Trade symbols (Trade event price): VIX, VIX1D

---

## Analysis Route (`/analysis`)

Auth-protected SSR. ECharts for all charts. Static analysis on historical data.

**Critical overnight range filter** (always apply):

```typescript
e.high !== null && e.low !== null && e.high > 0 && e.low > 0;
// old rows have null OHLC — produces 6000pt "ranges" without this
```

**Regime charts**: use `classifySessionFinal()` + `resolveSessionTypeColors()`. All scatters: `emphasis: { focus: "series" }` + `blur: { itemStyle: { opacity: 0.12 } }`.

---

## Trading Plan Route (`/tradingplan`)

Auth-protected SSR. URL access only — no nav link.

**Regime scoring (max ±6)**: gamma regime (±2), skew pctile (±1), VIX1D/VIX (±1), overnight ES range (±1), balance at price (±1).

- Tight ON → trending RTH (+1), wide ON → reverting RTH (-1). Validated Apr 13–17.

**Condition log types**: CONFIRM | REGIME_BREAK | TRADE | NOTE

**Slated for redesign**: replace numeric score with magnitude + character forecasts, auto-classification post-session.

---

## Key Conventions

- **Always ask for current file before modifying** — Pedro tweaks between sessions
- **Timezones**: UTC stored, CT displayed, ET for market hours gating + date strings
- **Hooks own data, components own UI**
- **useLiveTick**: one WebSocket, CORE_SYMBOLS + watchlist + real position symbols
- **Hydration**: never compute time-varying values during SSR — null state + useEffect pattern
- **No hardcoded hex** — add tokens to `globals.css @theme`, use via Tailwind/THEME/cssVar()
- **Session classification**: always via `classifySessionFinal()` — never local thresholds
- **ECharts scatter**: always `emphasis: { focus: "series" }` + `blur: { itemStyle: { opacity: 0.12 } }`
- **session_summary + trading_plans**: upsert with `onConflict: "date"`
- **Opening ATM**: always from DXFeed Quote mid — never Summary.openPrice
- **Overnight range filter**: `e.high !== null && e.low !== null && e.high > 0 && e.low > 0`
- **weekly_straddle_snapshots**: needs both `anon read` AND `auth read` RLS policies
- **VIX/VIX1D**: always `tick.last`
- **Skew data**: only valid from 2026-04-02
- **Chart timezone**: always CT — use `tickMarkFormatter` + `localization.timeFormatter`
- **PositionsPanel lockedView**: pass `"real"` or `"sml"` to lock view (used by PositionsSideBySide); omit for legacy toggle behavior
- **Evidence line arithmetic**: held = `magnitude × character` (both in straddle units, so held ≤ peak always)
- **Narrative language**: English throughout on new LiveTab. Legacy PT narration (`buildLiveRead`) kept only for backward compat on `/` route.
- **Tag vocabulary**: do not invent new tag codes or synthesis phrases without discussion — full vocabulary documented above

---

## Pending / Planned

### Immediate

- Apply CT timezone fix to `StraddleSpxChart.tsx` + `SkewHistoryChart.tsx` (same `tickMarkFormatter` pattern already applied to `FlyMiniChart`)
- Confirm `/live` route fully working on prod with all new components

### Chunk 3 — Tab Content

- **POSITIONS tab**: expanded per-leg view, Greeks panel, filtered by account
- **CHART tab**: multi-instrument continuous time series with metric overlays
- **MACRO tab**: full economic calendar + term structure + vol surface
- Wire `hasMacro` from `trading_plans.has_high_impact_macro` (currently `false` stub in LiveTab)
- Wire real tick latency in TopHeader (currently static 12ms)
- Decision: retire `/` route or keep permanently

### QuantEdge Integration

- API schema design (pending API docs / example response)
- `dealer_positioning_snapshots` Supabase table
- Poller integration (open + 5min RTH)
- LIVE tab dealer positioning panel
- Morning framework auto-population

### Medium Term

- Trading plan redesign: magnitude + character forecasts, auto-classification post-session
- Closing VIX1D/VIX in `writeCloseSummary`
- `/charts` route
- Regime score feedback loop in `/analysis`
- Conditional stats (needs ~30 sessions)
