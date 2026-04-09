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
import { StraddleSnapshot, RtmSession, EsSnapshot } from "../types";

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

export default function Dashboard({
  initialStraddleData,
  initialSmlSession,
}: Props) {
  const [activeTab, setActiveTab] = useState<Tab>("MKT");
  const [selectedDate, setSelectedDate] = useState<string>(
    new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" }),
  );
  const [nowCt, setNowCt] = useState(ctTime);

  useEffect(() => {
    const interval = setInterval(() => setNowCt(ctTime()), 1000);
    return () => clearInterval(interval);
  }, []);

  const { straddleData, esBasis } = useStraddleData(
    selectedDate,
    initialStraddleData,
  );
  const { smlSession, setSmlSession, flySnapshots, patchEntryMid } = useFlyData(
    selectedDate,
    initialSmlSession,
  );
  const { skewSnapshots } = useSkewData(selectedDate);
  const { esData, lastEsTime } = useEsData(selectedDate);
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
        <div className="max-w-7xl mx-auto px-6 flex items-center justify-between h-9">
          <div className="flex items-center h-full">
            {TABS.map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`font-sans h-full px-4 text-xs tracking-widest uppercase transition-colors border-b-2 ${
                  activeTab === tab
                    ? "text-[#888] border-[#555]"
                    : "text-[#333] border-transparent hover:text-[#555] hover:cursor-pointer"
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-4">
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="font-mono bg-transparent text-[#333] text-xs hover:cursor-pointer outline-none border-none"
            />

            {/* CT clock — replaces static date label */}
            <span
              className="font-mono text-xs text-[#333]"
              suppressHydrationWarning
            >
              {nowCt} CT
            </span>

            <div className="w-px h-4 bg-[#1a1a1a]" />
            <EsSpxConverter initialBasis={liveBasis} compact />
            <div className="w-px h-4 bg-[#1a1a1a]" />
            <form action={signOut}>
              <button
                type="submit"
                className="font-sans text-xs text-[#2a2a2a] hover:text-[#555] transition-colors hover:cursor-pointer uppercase tracking-widest"
              >
                log out
              </button>
            </form>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6">
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
