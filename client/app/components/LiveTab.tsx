"use client";

import { useMemo, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import LiveReadPanel from "./LiveReadPanel";
import InstrumentCards from "./InstrumentCards";
import MetricsGrid from "./MetricsGrid";
import IntradayCharts from "./IntradayCharts";
import PositionsSideBySide from "./PositionsSideBySide";
import CalendarFixedHeight from "./CalendarFixedHeight";
import { useStraddleData } from "../hooks/useStraddleData";
import { useSkewHistory } from "../hooks/useSkewHistory";
import { useFlyData } from "../hooks/useFlyData";
import { useLiveTick, ES_STREAMER_SYMBOL } from "../hooks/useLiveTick";
import { useWatchlist } from "../hooks/useWatchlist";
import { useRealPositions } from "../hooks/useRealPositions";
import { useDealerSnapshot } from "../hooks/useDealerSnapshot";
import { StraddleSnapshot, RtmSession, DealerStrikeRow } from "../types";
import {
  computeSkewCharacter,
  computePriceCharacter,
} from "../lib/sessionCharacter";

type Props = {
  initialStraddleData: StraddleSnapshot[];
  initialSmlSession: RtmSession | null;
};

const CORE_SYMBOLS = ["SPX", ES_STREAMER_SYMBOL, "VIX", "VIX1D"];
const CHARM_FLIP_MIN_MINUTES = 210; // 13:00 ET — before this charm flip is noise
const CHARM_FLIP_RANGE_PT = 50; // only look ±50pt from spot

function isSpxOpenFor(d: Date): boolean {
  const day = d.toLocaleDateString("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
  });
  const time = d.toLocaleTimeString("en-US", {
    timeZone: "America/New_York",
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  if (["Sat", "Sun"].includes(day)) return false;
  return time >= "09:30:00" && time < "16:00:00";
}

function isEsOpenFor(d: Date): boolean {
  const day = d.toLocaleDateString("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
  });
  const time = d.toLocaleTimeString("en-US", {
    timeZone: "America/New_York",
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  if (day === "Sat") return false;
  if (day === "Sun" && time < "18:00:00") return false;
  if (!["Sat", "Sun"].includes(day) && time >= "17:00:00" && time < "18:00:00")
    return false;
  return true;
}

function minutesSinceOpenFor(d: Date): number {
  const timeStr = d.toLocaleTimeString("en-GB", {
    timeZone: "America/New_York",
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
  });
  const [h, m] = timeStr.split(":").map(Number);
  const mins = h * 60 + m;
  const openMins = 9 * 60 + 30;
  return Math.max(0, mins - openMins);
}

// Walk CEX strikes near spot, find first adjacent sign change = charm flip level
function computeCharmFlip(
  strikes: DealerStrikeRow[] | null,
  spot: number | null,
): number | null {
  if (!strikes || !spot || strikes.length === 0) return null;

  const near = strikes
    .filter((r) => Math.abs(r[0] - spot) <= CHARM_FLIP_RANGE_PT && r[1] !== 0)
    .sort((a, b) => a[0] - b[0]);

  if (near.length < 2) return null;

  let closest: number | null = null;
  let closestDist = Infinity;

  for (let i = 0; i < near.length - 1; i++) {
    const curr = near[i];
    const next = near[i + 1];
    if (Math.sign(curr[1]) !== Math.sign(next[1])) {
      // Pick whichever of the two strikes is closer to spot
      const candidate =
        Math.abs(curr[0] - spot) < Math.abs(next[0] - spot) ? curr[0] : next[0];
      const dist = Math.abs(candidate - spot);
      if (dist < closestDist) {
        closestDist = dist;
        closest = candidate;
      }
    }
  }

  return closest;
}

export default function LiveTab({
  initialStraddleData,
  initialSmlSession,
}: Props) {
  const searchParams = useSearchParams();
  const dateParam = searchParams.get("date");
  const today =
    dateParam ??
    new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });

  const [clockTick, setClockTick] = useState<Date | null>(null);
  useEffect(() => {
    // Defer initial set to the next microtask — avoids React 19's
    // "setState synchronously in effect" cascading-render warning.
    queueMicrotask(() => setClockTick(new Date()));
    const t = setInterval(() => setClockTick(new Date()), 10_000);
    return () => clearInterval(t);
  }, []);

  const { straddleData } = useStraddleData(today, initialStraddleData, 1);
  const { skewHistory, latestSkew, avgSkew } = useSkewHistory();
  const { smlSession, flySnapshots } = useFlyData(today, initialSmlSession);
  const { entries: watchlistEntries } = useWatchlist();
  const { gex: latestGex, cex: latestCex } = useDealerSnapshot(today);

  const {
    legs: realLegs,
    streamerSymbols: realSymbols,
    isLoading: realIsLoading,
    error: realError,
  } = useRealPositions();

  const allSymbols = useMemo(() => {
    const set = new Set(CORE_SYMBOLS);
    for (const e of watchlistEntries) set.add(e.streamerSymbol);
    for (const s of realSymbols) set.add(s);
    return Array.from(set);
  }, [watchlistEntries, realSymbols]);

  const ticks = useLiveTick(allSymbols);

  const spxTick = ticks["SPX"] ?? null;
  const esTick = ticks[ES_STREAMER_SYMBOL] ?? null;
  const vixTick = ticks["VIX"] ?? null;
  const vix1dTick = ticks["VIX1D"] ?? null;

  const spxOpen = clockTick ? isSpxOpenFor(clockTick) : false;
  const esOpen = clockTick ? isEsOpenFor(clockTick) : false;
  const minutesSinceOpen = clockTick ? minutesSinceOpenFor(clockTick) : 0;

  const todayRows = useMemo(
    () =>
      straddleData.filter(
        (s) =>
          new Date(s.created_at).toLocaleDateString("en-CA", {
            timeZone: "America/New_York",
          }) === today,
      ),
    [straddleData, today],
  );

  const todaySkewRows = useMemo(
    () =>
      skewHistory.filter(
        (s) =>
          new Date(s.created_at).toLocaleDateString("en-CA", {
            timeZone: "America/New_York",
          }) === today,
      ),
    [skewHistory, today],
  );

  const latest = todayRows[todayRows.length - 1] ?? null;
  const opening = todayRows[0] ?? null;
  const liveSpx = spxTick?.mid ?? latest?.spx_ref ?? null;

  const openingSkew = useMemo(
    () =>
      skewHistory.find(
        (s) =>
          new Date(s.created_at).toLocaleDateString("en-CA", {
            timeZone: "America/New_York",
          }) === today,
      ) ?? null,
    [skewHistory, today],
  );

  const skewPctile = useMemo(() => {
    if (!latestSkew || skewHistory.length === 0) return null;
    const below = skewHistory.filter((s) => s.skew <= latestSkew.skew).length;
    return Math.round((below / skewHistory.length) * 100);
  }, [latestSkew, skewHistory]);

  const currentMovePts =
    opening && liveSpx ? Math.abs(liveSpx - opening.spx_ref) : null;
  const realizedPct =
    currentMovePts !== null && opening && opening.straddle_mid > 0
      ? (currentMovePts / opening.straddle_mid) * 100
      : null;

  const { maxSpx, minSpx } = useMemo(() => {
    if (todayRows.length === 0)
      return { maxSpx: null as number | null, minSpx: null as number | null };
    const prices = todayRows.map((r) => r.spx_ref);
    if (liveSpx !== null) prices.push(liveSpx);
    return { maxSpx: Math.max(...prices), minSpx: Math.min(...prices) };
  }, [todayRows, liveSpx]);

  const skewChar = useMemo(
    () => computeSkewCharacter(todaySkewRows),
    [todaySkewRows],
  );

  const priceChar = useMemo(
    () =>
      computePriceCharacter(
        opening?.spx_ref ?? null,
        liveSpx,
        maxSpx,
        minSpx,
        opening?.straddle_mid ?? null,
      ),
    [opening, liveSpx, maxSpx, minSpx],
  );

  const vixLast = vixTick?.last ?? null;
  const vix1dLast = vix1dTick?.last ?? null;
  const vix1dVixRatio =
    vix1dLast && vixLast && vixLast > 0 ? vix1dLast / vixLast : null;

  const atmIv = latestSkew?.atm_iv ?? null;

  // Charm flip — computed from latest CEX snapshot strikes
  const charmFlipStrike = useMemo(
    () => computeCharmFlip(latestCex?.strikes ?? null, liveSpx),
    [latestCex, liveSpx],
  );

  const instruments = useMemo(
    () => [
      {
        label: "SPX",
        price: liveSpx,
        prevClose: spxTick?.prevClose ?? null,
        isOpen: spxOpen,
      },
      {
        label: "ES",
        price: esTick?.mid ?? null,
        prevClose: esTick?.prevClose ?? null,
        isOpen: esOpen,
      },
      {
        label: "VIX",
        price: vixLast,
        prevClose: vixTick?.prevClose ?? null,
        isOpen: spxOpen,
      },
      {
        label: "VIX1D",
        price: vix1dLast,
        prevClose: vix1dTick?.prevClose ?? null,
        isOpen: spxOpen,
      },
    ],
    [
      liveSpx,
      spxTick,
      esTick,
      vixTick,
      vixLast,
      vix1dTick,
      vix1dLast,
      spxOpen,
      esOpen,
    ],
  );

  const lastSnapshotTs = latest?.created_at ?? null;

  return (
    <div className="max-w-7xl mx-auto px-4 md:px-6 py-3 space-y-3">
      <LiveReadPanel
        price={priceChar}
        skew={skewChar}
        skewPctile={skewPctile}
        realizedPts={currentMovePts}
        realizedPct={realizedPct}
        openingStraddle={opening?.straddle_mid ?? null}
        minutesSinceOpen={minutesSinceOpen}
        timestamp={lastSnapshotTs}
        charmFlipStrike={charmFlipStrike}
      />

      <InstrumentCards instruments={instruments} />

      <MetricsGrid
        straddleMid={latest?.straddle_mid ?? null}
        openingStraddle={opening?.straddle_mid ?? null}
        realizedPts={currentMovePts}
        realizedPct={realizedPct}
        atmIv={atmIv}
        skew={latestSkew?.skew ?? null}
        skewPctile={skewPctile}
        vix1dVixRatio={vix1dVixRatio}
        dealerTotal={latestGex?.total ?? null}
        dealerLocal={latestGex?.local_total ?? null}
        dealerCexTotal={latestCex?.total ?? null}
        dealerCexLocal={latestCex?.local_total ?? null}
        dealerTopPosStrike={latestGex?.top_pos_strike ?? null}
        dealerTopPosValue={latestGex?.top_pos_value ?? null}
        dealerTopNegStrike={latestGex?.top_neg_strike ?? null}
        dealerTopNegValue={latestGex?.top_neg_value ?? null}
      />

      <IntradayCharts
        straddleData={todayRows}
        currentSpx={spxTick?.mid ?? null}
        openingSkew={openingSkew}
        skewHistory={skewHistory}
        avgSkew={avgSkew}
        dealerGex={latestGex}
      />

      <PositionsSideBySide
        smlSession={smlSession}
        flySnapshots={flySnapshots}
        realLegs={realLegs}
        realTicks={ticks}
        realIsLoading={realIsLoading}
        realError={realError}
      />

      <CalendarFixedHeight selectedDate={today} />
    </div>
  );
}
