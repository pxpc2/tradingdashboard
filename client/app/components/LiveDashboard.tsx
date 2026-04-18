"use client";

import { useMemo } from "react";
import WorldClock from "./WorldClock";
import StraddleSpxChart from "./StraddleSpxChart";
import SkewHistoryChart from "./SkewHistoryChart";
import MacroEvents from "./MacroEvents";
import PositionsPanel from "./PositionsPanel";
import WatchlistStrip from "./WatchlistStrip";
import EsSpxConverter from "./Converter";
import { useStraddleData } from "../hooks/useStraddleData";
import { useSkewHistory } from "../hooks/useSkewHistory";
import { useFlyData } from "../hooks/useFlyData";
import { useEsData } from "../hooks/useEsData";
import { useLiveTick, ES_STREAMER_SYMBOL } from "../hooks/useLiveTick";
import { useWatchlist } from "../hooks/useWatchlist";
import { signOut } from "../login/actions";
import { StraddleSnapshot, RtmSession } from "../types";
import { FaSignOutAlt } from "react-icons/fa";
import { useSearchParams } from "next/navigation";
import { useRealPositions } from "../hooks/useRealPositions";
import Link from "next/link";

type Props = {
  initialStraddleData: StraddleSnapshot[];
  initialSmlSession: RtmSession | null;
};

const CORE_SYMBOLS = ["SPX", ES_STREAMER_SYMBOL];

function isSpxOpen(): boolean {
  const day = new Date().toLocaleDateString("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
  });
  const time = new Date().toLocaleTimeString("en-US", {
    timeZone: "America/New_York",
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  if (["Sat", "Sun"].includes(day)) return false;
  return time >= "09:30:00" && time < "16:00:00";
}

function isEsOpen(): boolean {
  const day = new Date().toLocaleDateString("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
  });
  const time = new Date().toLocaleTimeString("en-US", {
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

function pctChange(
  current: number | null,
  prevClose: number | null,
): string | null {
  if (!current || !prevClose || prevClose === 0) return null;
  return (((current - prevClose) / prevClose) * 100).toFixed(2);
}

// Blue for up, amber for down
function pctColor(pct: string | null): string {
  if (!pct) return "#666";
  return parseFloat(pct) >= 0 ? "#60a5fa" : "#E4D00A";
}

export default function LiveDashboard({
  initialStraddleData,
  initialSmlSession,
}: Props) {
  const searchParams = useSearchParams();
  const today =
    searchParams.get("date") ??
    new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });

  const { straddleData, esBasis } = useStraddleData(
    today,
    initialStraddleData,
    1,
  );
  const { skewHistory, latestSkew, avgSkew } = useSkewHistory();
  const { smlSession, flySnapshots } = useFlyData(today, initialSmlSession);
  const { esData } = useEsData(today, 1);
  const { entries: watchlistEntries } = useWatchlist();

  const {
    legs: realLegs,
    streamerSymbols: realSymbols,
    isLoading: realIsLoading,
    error: realError,
  } = useRealPositions();

  const openingSkew = useMemo(() => {
    return (
      skewHistory.find(
        (s) =>
          new Date(s.created_at).toLocaleDateString("en-CA", {
            timeZone: "America/New_York",
          }) === today,
      ) ?? null
    );
  }, [skewHistory, today]);

  const skewPctile = useMemo(() => {
    if (!latestSkew || skewHistory.length === 0) return null;
    const below = skewHistory.filter((s) => s.skew <= latestSkew.skew).length;
    return Math.round((below / skewHistory.length) * 100);
  }, [latestSkew, skewHistory]);

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
  const vixLast = vixTick?.last ?? null;
  const vixPct = pctChange(vixLast, vixTick?.prevClose ?? null);

  const vix1dTick = ticks["VIX1D"] ?? null;
  const vix1dLast = vix1dTick?.last ?? null;
  const vix1dPct = pctChange(vix1dLast, vix1dTick?.prevClose ?? null);

  const vixRatio =
    vix1dLast && vixLast && vixLast > 0
      ? (vix1dLast / vixLast).toFixed(2)
      : null;

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

  const latest = todayRows[todayRows.length - 1] ?? null;
  const opening = todayRows[0] ?? null;

  const liveSpx = spxTick?.mid ?? latest?.spx_ref ?? null;
  const liveEs = esTick?.mid ?? esData[esData.length - 1]?.es_ref ?? null;

  const liveBasis =
    spxTick && esTick
      ? parseFloat((esTick.mid - spxTick.mid).toFixed(2))
      : esBasis;

  const currentMovePts =
    opening && liveSpx ? Math.abs(liveSpx - opening.spx_ref) : null;
  const realizedMovePct =
    currentMovePts !== null && opening && opening.straddle_mid > 0
      ? ((currentMovePts / opening.straddle_mid) * 100).toFixed(0)
      : null;
  const realizedColor =
    realizedMovePct && parseInt(realizedMovePct) >= 100
      ? "#f87171"
      : realizedMovePct && parseInt(realizedMovePct) >= 70
        ? "#f59e0b"
        : "#9ca3af";

  const spxOpen = isSpxOpen();
  const esOpen = isEsOpen();

  const spxPct = pctChange(liveSpx, spxTick?.prevClose ?? null);
  const esPct = pctChange(liveEs, esTick?.prevClose ?? null);

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      {/* Header */}
      <div className="border-b border-[#1a1a1a] bg-[#0a0a0a] sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 md:px-6 flex items-center justify-between h-10">
          <div className="hidden md:block flex-1 mr-4 overflow-x-auto scrollbar-none">
            <WatchlistStrip entries={watchlistEntries} ticks={ticks} />
          </div>

          <div className="flex items-center gap-3 md:gap-4 shrink-0">
            {liveBasis !== null && (
              <span className="font-mono text-sm text-[#555] md:hidden">
                B {liveBasis > 0 ? "+" : ""}
                {liveBasis.toFixed(2)}
              </span>
            )}
            <div className="hidden md:flex items-center gap-3">
              <div className="w-px h-4 bg-[#1a1a1a]" />
              <EsSpxConverter initialBasis={liveBasis} compact />
            </div>
            <div className="w-px h-4 bg-[#1a1a1a]" />
            <Link href="/analysis">
              <span className="font-sans text-xs text-[#555] hover:text-[#f59e0b] transition-colors uppercase tracking-widest">
                aba /Analysis
              </span>
            </Link>
            <form action={signOut}>
              <button
                type="submit"
                className="font-sans text-xs text-[#555] hover:text-[#666] transition-colors hover:cursor-pointer uppercase tracking-widest"
              >
                <FaSignOutAlt className="text-md hover:text-[#f59e0b]" />
              </button>
            </form>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 md:px-6 py-4 md:py-5">
        <div className="mb-4">
          <WorldClock />
        </div>

        {/* SPX + ES + VIX row */}
        <div className="mb-4 pb-4 border-b border-[#222]">
          <div className="flex gap-10 mb-3">
            {/* SPX */}
            <div className="flex items-center gap-2">
              <div
                className="w-0.5 h-5"
                style={{ backgroundColor: spxOpen ? "#4ade80" : "#2a2a2a" }}
              />
              <span className="font-sans text-xs text-[#666] uppercase">
                SPX
              </span>
              <span className="font-mono text-xl text-[#9ca3af] font-light">
                {liveSpx?.toFixed(2) ?? "—"}
              </span>
              {spxPct && (
                <span
                  className="font-mono text-sm"
                  style={{ color: pctColor(spxPct) }}
                >
                  {parseFloat(spxPct) >= 0 ? "+" : ""}
                  {spxPct}%
                </span>
              )}
            </div>

            {/* ES */}
            <div className="flex items-center gap-2">
              <div
                className="w-0.5 h-5"
                style={{ backgroundColor: esOpen ? "#4ade80" : "#2a2a2a" }}
              />
              <span className="font-sans text-xs text-[#666] uppercase">
                ES
              </span>
              <span className="font-mono text-xl text-[#9ca3af] font-light">
                {liveEs?.toFixed(2) ?? "—"}
              </span>
              {esPct && (
                <span
                  className="font-mono text-sm"
                  style={{ color: pctColor(esPct) }}
                >
                  {parseFloat(esPct) >= 0 ? "+" : ""}
                  {esPct}%
                </span>
              )}
            </div>

            {/* VIX */}
            <div className="flex items-center gap-2">
              <div
                className="w-0.5 h-5"
                style={{ backgroundColor: spxOpen ? "#4ade80" : "#2a2a2a" }}
              />
              <span className="font-sans text-xs text-[#666] uppercase">
                VIX
              </span>
              <span className="font-mono text-xl text-[#9ca3af] font-light">
                {vixLast?.toFixed(2) ?? "—"}
              </span>
              {vixPct && (
                <span
                  className="font-mono text-sm"
                  style={{ color: pctColor(vixPct) }}
                >
                  {parseFloat(vixPct) >= 0 ? "+" : ""}
                  {vixPct}%
                </span>
              )}
            </div>

            {/* VIX1D */}
            <div className="flex items-center gap-2">
              <div
                className="w-0.5 h-5"
                style={{ backgroundColor: spxOpen ? "#4ade80" : "#2a2a2a" }}
              />
              <span className="font-sans text-xs text-[#666] uppercase">
                VIX1D
              </span>
              <span className="font-mono text-xl text-[#9ca3af] font-light">
                {vix1dLast?.toFixed(2) ?? "—"}
              </span>
              {vix1dPct && (
                <span
                  className="font-mono text-sm"
                  style={{ color: pctColor(vix1dPct) }}
                >
                  {parseFloat(vix1dPct) >= 0 ? "+" : ""}
                  {vix1dPct}%
                </span>
              )}
            </div>
          </div>

          {/* Metrics strip */}
          <div className="flex gap-6 flex-wrap">
            <div>
              <span className="font-sans text-[11px] text-[#555] uppercase tracking-wide">
                Straddle
              </span>
              <div className="font-mono text-lg text-[#9ca3af] font-light">
                ${latest?.straddle_mid?.toFixed(2) ?? "—"}
              </div>
            </div>
            <div className="w-px bg-[#1f1f1f]" />
            <div>
              <span className="font-sans text-[11px] text-[#555] uppercase tracking-wide">
                Implied
              </span>
              <div className="font-mono text-lg text-[#9ca3af] font-light">
                ${opening?.straddle_mid?.toFixed(2) ?? "—"}
              </div>
            </div>
            <div className="w-px bg-[#1f1f1f]" />
            <div>
              <span className="font-sans text-[11px] text-[#555] uppercase tracking-wide">
                Realized
              </span>
              <div
                className="font-mono text-lg font-light"
                style={{ color: realizedColor }}
              >
                {currentMovePts !== null
                  ? `${currentMovePts.toFixed(1)}pts`
                  : "—"}
                {realizedMovePct && (
                  <span className="text-sm ml-1">({realizedMovePct}%)</span>
                )}
              </div>
            </div>
            <div className="w-px bg-[#1f1f1f]" />
            <div>
              <span className="font-sans text-[11px] text-[#555] uppercase tracking-wide">
                IV30
              </span>
              <div className="font-mono text-lg text-[#9ca3af] font-light">
                {latestSkew ? (latestSkew.atm_iv * 100).toFixed(1) : "—"}
              </div>
            </div>
            <div className="w-px bg-[#1f1f1f]" />
            <div>
              <span className="font-sans text-[11px] text-[#555] uppercase tracking-wide">
                Skew
              </span>
              <div className="font-mono text-lg text-[#9ca3af] font-light">
                {latestSkew?.skew?.toFixed(3) ?? "—"}
              </div>
              {skewPctile !== null && (
                <div className="font-mono text-[10px] text-[#444]">
                  {skewPctile}th %ile
                </div>
              )}
            </div>
            <div className="w-px bg-[#1f1f1f]" />
            <div>
              <span className="font-sans text-[11px] text-[#555] uppercase tracking-wide">
                Call IV / Put IV
              </span>
              <div className="font-mono text-lg text-[#9ca3af] font-light">
                {latestSkew
                  ? `${(latestSkew.call_iv * 100).toFixed(1)} / ${(latestSkew.put_iv * 100).toFixed(1)}`
                  : "—"}
              </div>
            </div>
            <div className="w-px bg-[#1f1f1f]" />
            <div>
              <span className="font-sans text-[11px] text-[#555] uppercase tracking-wide">
                1D VOL ratio
              </span>
              <div
                className="font-mono text-lg font-light"
                style={{
                  color: vixRatio
                    ? parseFloat(vixRatio) >= 1
                      ? "#f59e0b"
                      : "#9ca3af"
                    : "#9ca3af",
                }}
              >
                {vixRatio ?? "—"}
              </div>
            </div>
          </div>
        </div>

        {/* Charts row */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4 pb-4 border-b border-[#222]">
          <StraddleSpxChart
            data={todayRows}
            currentSpxPrice={spxTick?.mid ?? null}
            openingSkew={openingSkew}
          />
          <SkewHistoryChart data={skewHistory} avgSkew={avgSkew} />
        </div>

        {/* Bottom row */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="h-[220px]">
            <MacroEvents selectedDate={today} />
          </div>
          <div className="h-[220px]">
            <PositionsPanel
              smlSession={smlSession}
              flySnapshots={flySnapshots}
              realLegs={realLegs}
              realTicks={ticks}
              realIsLoading={realIsLoading}
              realError={realError}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
