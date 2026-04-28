"use client";

import { useMemo } from "react";
import { useFlyData } from "../hooks/useFlyData";
import { useRealPositions } from "../hooks/useRealPositions";
import { useWatchlist } from "../hooks/useWatchlist";
import { useLiveTick } from "../hooks/useLiveTick";
import { useEsContract } from "../hooks/useEsContract";
import PositionsSideBySide from "./PositionsSideBySide";
import { RtmSession } from "../types";

type Props = {
  initialSmlSession: RtmSession | null;
};

const CORE_SYMBOLS = ["SPX", "VIX", "VIX1D"];

export default function PositionsTab({ initialSmlSession }: Props) {
  const today = new Date().toLocaleDateString("en-CA", {
    timeZone: "America/New_York",
  });

  const { smlSession, flySnapshots } = useFlyData(today, initialSmlSession);
  const { entries: watchlistEntries } = useWatchlist();
  const { esSymbol } = useEsContract();

  const {
    legs: realLegs,
    streamerSymbols: realSymbols,
    isLoading: realIsLoading,
    error: realError,
  } = useRealPositions();

  const allSymbols = useMemo(() => {
    const set = new Set(CORE_SYMBOLS);
    if (esSymbol) set.add(esSymbol);
    for (const e of watchlistEntries) set.add(e.streamerSymbol);
    for (const s of realSymbols) set.add(s);
    return Array.from(set);
  }, [watchlistEntries, realSymbols, esSymbol]);

  const ticks = useLiveTick(allSymbols);

  return (
    <div className="max-w-7xl mx-auto px-4 md:px-6 py-3 space-y-3">
      <PositionsSideBySide
        smlSession={smlSession}
        flySnapshots={flySnapshots}
        realLegs={realLegs}
        realTicks={ticks}
        realIsLoading={realIsLoading}
        realError={realError}
      />
    </div>
  );
}
