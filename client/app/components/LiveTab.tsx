"use client";

import { useMemo, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import LiveReadPanel from "./LiveReadPanel";
import InstrumentCards from "./InstrumentCards";
import MetricsGrid from "./MetricsGrid";
import IntradayCharts from "./IntradayCharts";
import { useStraddleData } from "../hooks/useStraddleData";
import { useSkewHistory } from "../hooks/useSkewHistory";
import { useLiveTick, ES_STREAMER_SYMBOL } from "../hooks/useLiveTick";
import { useWatchlist } from "../hooks/useWatchlist";
import { StraddleSnapshot } from "../types";
import {
  computeSkewCharacter,
  computePriceCharacter,
} from "../lib/sessionCharacter";
import Sectors from "./Sectors";
import TopMovers from "./TopMovers";
import NewsWire from "./NewsWire";
import CalendarFixedHeight from "./CalendarFixedHeight";
import type { WeeklyStraddleRow } from "../(dashboard)/live/page";

type Props = {
  initialStraddleData: StraddleSnapshot[];
  initialWeeklyStraddle: WeeklyStraddleRow | null;
};

const CORE_SYMBOLS = ["SPX", ES_STREAMER_SYMBOL, "VIX", "VIX1D", "VIX3M"];

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

export default function LiveTab({
  initialStraddleData,
  initialWeeklyStraddle,
}: Props) {
  const searchParams = useSearchParams();
  const dateParam = searchParams.get("date");
  const today =
    dateParam ??
    new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });

  const [clockTick, setClockTick] = useState<Date | null>(null);
  useEffect(() => {
    queueMicrotask(() => setClockTick(new Date()));
    const t = setInterval(() => setClockTick(new Date()), 10_000);
    return () => clearInterval(t);
  }, []);

  const { straddleData } = useStraddleData(today, initialStraddleData, 1);
  const { skewHistory, latestSkew, avgSkew } = useSkewHistory();
  const { entries: watchlistEntries } = useWatchlist();

  const allSymbols = useMemo(() => {
    const set = new Set(CORE_SYMBOLS);
    for (const e of watchlistEntries) set.add(e.streamerSymbol);
    return Array.from(set);
  }, [watchlistEntries]);

  const ticks = useLiveTick(allSymbols);

  const spxTick = ticks["SPX"] ?? null;
  const esTick = ticks[ES_STREAMER_SYMBOL] ?? null;
  const vixTick = ticks["VIX"] ?? null;
  const vix1dTick = ticks["VIX1D"] ?? null;
  const vix3mTick = ticks["VIX3M"] ?? null;

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
  const vix3mLast = vix3mTick?.last ?? null;

  const vix1dVixRatio =
    vix1dLast && vixLast && vixLast > 0 ? vix1dLast / vixLast : null;

  // VIX/VIX3M: > 1 = backwardation (stress), < 1 = contango (normal)
  const volRegimeRatio =
    vixLast && vix3mLast && vix3mLast > 0 ? vixLast / vix3mLast : null;

  const atmIv = latestSkew?.atm_iv ?? null;

  // Weekly straddle: implied bounds = atm_strike ± straddle_mid
  const weeklyAtm = initialWeeklyStraddle?.atm_strike ?? null;
  const weeklyStraddleMid = initialWeeklyStraddle?.straddle_mid ?? null;
  const weeklyExpiry = initialWeeklyStraddle?.expiry_date ?? null;
  const weeklyImpliedHigh =
    weeklyAtm !== null && weeklyStraddleMid !== null
      ? weeklyAtm + weeklyStraddleMid
      : null;
  const weeklyImpliedLow =
    weeklyAtm !== null && weeklyStraddleMid !== null
      ? weeklyAtm - weeklyStraddleMid
      : null;

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
      />

      <InstrumentCards instruments={instruments} />

      <MetricsGrid
        straddleMid={latest?.straddle_mid ?? null}
        openingStraddle={opening?.straddle_mid ?? null}
        openingSpx={opening?.spx_ref ?? null}
        openingPutIv={openingSkew?.put_iv ?? null}
        openingCallIv={openingSkew?.call_iv ?? null}
        openingAtmIv={openingSkew?.atm_iv ?? null}
        realizedPts={currentMovePts}
        realizedPct={realizedPct}
        atmIv={atmIv}
        skew={latestSkew?.skew ?? null}
        skewPctile={skewPctile}
        vix1dVixRatio={vix1dVixRatio}
        volRegimeRatio={volRegimeRatio}
        weeklyImpliedHigh={weeklyImpliedHigh}
        weeklyImpliedLow={weeklyImpliedLow}
        weeklyAtm={weeklyAtm}
        weeklyExpiry={weeklyExpiry}
      />

      <IntradayCharts
        straddleData={todayRows}
        currentSpx={spxTick?.mid ?? null}
        openingSkew={openingSkew}
        skewHistory={skewHistory}
        avgSkew={avgSkew}
      />

      <div className="grid grid-cols-3 gap-3">
        <Sectors />
        <TopMovers kind="gainers" />
        <TopMovers kind="losers" />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="col-span-2">
          <NewsWire />
        </div>
        <CalendarFixedHeight selectedDate={today} height={400} />
      </div>
    </div>
  );
}
