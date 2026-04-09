"use client";

import { useState, useMemo, useEffect } from "react";
import MktView from "./MktView";
import VolView from "./VolView";
import PosView from "./PosView";
import EsSpxConverter from "./Converter";
import { useStraddleData } from "../hooks/useStraddleData";
import { useFlyData } from "../hooks/useFlyData";
import { useSkewData } from "../hooks/useSkewData";
import { useEsData } from "../hooks/useEsData";
import { useLiveTick, ES_STREAMER_SYMBOL } from "../hooks/useLiveTick";
import { useWatchlist } from "../hooks/useWatchlist";
import { signOut } from "../login/actions";
import { StraddleSnapshot, RtmSession, EsSnapshot, ChartRange } from "../types";

type Props = {
  initialStraddleData: StraddleSnapshot[];
  initialSmlSession: RtmSession | null;
};

const TABS = ["MKT", "VOL", "POS"] as const;
type Tab = (typeof TABS)[number];
const CORE_SYMBOLS = ["SPX", ES_STREAMER_SYMBOL];

function isToday(selectedDate: string): boolean {
  return (
    selectedDate ===
    new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" })
  );
}

function computeOvernightLevels(esData: EsSnapshot[], selectedDate: string) {
  const rthOpen = new Date(`${selectedDate}T13:30:00Z`).getTime();
  const globexOpen = rthOpen - 15.5 * 60 * 60 * 1000;
  const overnightPoints = esData.filter((s) => {
    const t = new Date(s.created_at).getTime();
    return t >= globexOpen && t < rthOpen;
  });
  if (overnightPoints.length === 0) return { onh: null, onl: null };
  return {
    onh: Math.max(...overnightPoints.map((s) => s.high ?? s.es_ref)),
    onl: Math.min(...overnightPoints.map((s) => s.low ?? s.es_ref)),
  };
}

function ctTime(): string {
  return new Date().toLocaleTimeString("en-US", {
    timeZone: "America/Chicago",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function rangeToDays(range: ChartRange): number {
  switch (range) {
    case "1H":
    case "4H":
    case "1D":
      return 1;
    case "3D":
      return 3;
    case "5D":
      return 5;
  }
}

export default function Dashboard({
  initialStraddleData,
  initialSmlSession,
}: Props) {
  const [activeTab, setActiveTab] = useState<Tab>("MKT");
  const [selectedDate, setSelectedDate] = useState<string>(
    new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" }),
  );
  const [nowCt, setNowCt] = useState(ctTime);
  const [spxRange, setSpxRange] = useState<ChartRange>("1D");
  const [esRange, setEsRange] = useState<ChartRange>("1D");

  useEffect(() => {
    const interval = setInterval(() => setNowCt(ctTime()), 1000);
    return () => clearInterval(interval);
  }, []);

  const spxDays = rangeToDays(spxRange);
  const esDays = rangeToDays(esRange);

  const { straddleData, esBasis } = useStraddleData(
    selectedDate,
    initialStraddleData,
    spxDays,
  );
  const { smlSession, setSmlSession, flySnapshots, patchEntryMid } = useFlyData(
    selectedDate,
    initialSmlSession,
  );
  const { skewSnapshots } = useSkewData(selectedDate);
  const { esData, lastEsTime } = useEsData(selectedDate, esDays);
  const { entries: watchlistEntries } = useWatchlist();

  const allSymbols = useMemo(() => {
    const set = new Set(CORE_SYMBOLS);
    for (const e of watchlistEntries) set.add(e.streamerSymbol);
    return Array.from(set);
  }, [watchlistEntries]);

  const ticks = useLiveTick(allSymbols);
  const spxTick = ticks["SPX"] ?? null;
  const esTick = ticks[ES_STREAMER_SYMBOL] ?? null;

  const liveBasis =
    spxTick && esTick
      ? parseFloat((esTick.mid - spxTick.mid).toFixed(2))
      : esBasis;

  const { onh, onl } =
    isToday(selectedDate) && esData.length > 0
      ? computeOvernightLevels(esData, selectedDate)
      : { onh: null, onl: null };

  const latestSpx = straddleData[straddleData.length - 1]?.spx_ref ?? 0;

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <div className="border-b border-[#1a1a1a] bg-[#0a0a0a] sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 md:px-6 flex items-center justify-between h-9">
          <div className="flex items-center h-full">
            {TABS.map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`font-sans h-full px-2 md:px-4 text-xs tracking-widest uppercase transition-colors border-b-2 ${
                  activeTab === tab
                    ? "text-[#888] border-[#555]"
                    : "text-[#555] border-transparent hover:text-[#888] hover:cursor-pointer"
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3 md:gap-4">
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="font-mono bg-transparent text-[#555]  text-xs hover:cursor-pointer outline-none border-none"
            />
            <span
              className="font-mono text-lg text-[#555]"
              suppressHydrationWarning
            >
              {nowCt} CT
            </span>

            {/* Basis — mobile only, replaces converter */}
            {liveBasis !== null && (
              <span className="font-mono text-xs text-[#555] md:hidden">
                B {liveBasis > 0 ? "+" : ""}
                {liveBasis.toFixed(2)}
              </span>
            )}

            {/* Converter — desktop only */}
            <div className="hidden md:flex items-center gap-4">
              <div className="w-px h-4 bg-[#1a1a1a]" />
              <EsSpxConverter initialBasis={liveBasis} compact />
            </div>

            <div className="w-px h-4 bg-[#1a1a1a]" />
            <form action={signOut}>
              <button
                type="submit"
                className="font-sans text-xs text-[#555] hover:text-[#555] transition-colors hover:cursor-pointer uppercase tracking-widest"
              >
                out
              </button>
            </form>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 md:px-6 py-4 md:py-6">
        <div
          style={{
            visibility: activeTab === "MKT" ? "visible" : "hidden",
            height: activeTab === "MKT" ? "auto" : "0",
            overflow: "hidden",
          }}
        >
          <MktView
            straddleData={straddleData}
            skewSnapshots={skewSnapshots}
            selectedDate={selectedDate}
            esBasis={esBasis}
            esData={esData}
            onh={onh}
            onl={onl}
            spxTick={spxTick}
            esTick={esTick}
            liveBasis={liveBasis}
            watchlistEntries={watchlistEntries}
            ticks={ticks}
            spxRange={spxRange}
            esRange={esRange}
            onSpxRangeChange={setSpxRange}
            onEsRangeChange={setEsRange}
          />
        </div>
        <div
          style={{
            visibility: activeTab === "VOL" ? "visible" : "hidden",
            height: activeTab === "VOL" ? "auto" : "0",
            overflow: "hidden",
          }}
        >
          <VolView
            straddleData={straddleData}
            skewSnapshots={skewSnapshots}
            selectedDate={selectedDate}
          />
        </div>
        <div
          style={{
            visibility: activeTab === "POS" ? "visible" : "hidden",
            height: activeTab === "POS" ? "auto" : "0",
            overflow: "hidden",
          }}
        >
          <PosView
            smlSession={smlSession}
            onSessionCreated={setSmlSession}
            flySnapshots={flySnapshots}
            onEntryEdit={patchEntryMid}
            selectedDate={selectedDate}
            spxPrice={latestSpx}
          />
        </div>
      </div>
    </div>
  );
}
