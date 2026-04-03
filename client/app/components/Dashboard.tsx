"use client";

import { useState, useEffect } from "react";
import LiveIndicator from "./LiveIndicator";
import StraddleView from "./StraddleView";
import SkewView from "./SkewView";
import SmlFlyView from "./SmlFlyView";
import PositionsView from "./PositionsView";
import { useStraddleData } from "../hooks/useStraddleData";
import { useFlyData } from "../hooks/useFlyData";
import { useSkewData } from "../hooks/useSkewData";
import { StraddleSnapshot, RtmSession } from "../types";

type Props = {
  initialStraddleData: StraddleSnapshot[];
  initialSmlSession: RtmSession | null;
};

const TABS = ["Straddle", "SML Fly", "Skew", "Posições"] as const;
type Tab = (typeof TABS)[number];

function useIsTallMode() {
  const [isTall, setIsTall] = useState(false);
  useEffect(() => {
    function check() {
      setIsTall(window.innerHeight >= 800);
    }
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);
  return isTall;
}

export default function Dashboard({
  initialStraddleData,
  initialSmlSession,
}: Props) {
  const [activeTab, setActiveTab] = useState<Tab>("Straddle");
  const [selectedDate, setSelectedDate] = useState<string>(
    new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" }),
  );
  const isTall = useIsTallMode();

  const { straddleData } = useStraddleData(selectedDate, initialStraddleData);
  const { smlSession, setSmlSession, flySnapshots, patchEntryMid } = useFlyData(
    selectedDate,
    initialSmlSession,
  );
  const { skewSnapshots } = useSkewData(selectedDate);

  const latestSpx = straddleData[straddleData.length - 1]?.spx_ref ?? 0;
  const lastStraddleTime =
    straddleData[straddleData.length - 1]?.created_at ?? null;
  const lastFlyTime = flySnapshots[flySnapshots.length - 1]?.created_at ?? null;
  const hasActiveSession = smlSession?.sml_ref != null;
  const lastSkewTime =
    skewSnapshots[skewSnapshots.length - 1]?.created_at ?? null;

  return (
    <div className="max-w-7xl mx-auto px-6 py-6">
      <div className="flex items-center justify-between mb-6">
        {!isTall && (
          <div className="flex gap-1 rounded-sm bg-[#111111] p-1">
            {TABS.map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-5 py-2 rounded-sm text-sm font-medium transition-colors ${
                  activeTab === tab
                    ? "bg-[#1f1f1f] text-white"
                    : "text-[#444444] hover:cursor-pointer hover:text-[#888888]"
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
        )}
        <input
          type="date"
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
          className="bg-[#111111] text-[#444444] border border-[#1f1f1f] rounded-sm px-2 py-1 text-sm"
        />
        <div className="flex items-center gap-3">
          <LiveIndicator
            lastStraddleTime={lastStraddleTime}
            lastFlyTime={lastFlyTime}
            hasActiveSession={hasActiveSession}
            lastQuoteTime={null}
            hasActivePositions={false}
            lastSkewTime={lastSkewTime}
          />
          <span className="text-sm text-gray-400">
            {new Date().toLocaleDateString("en-US", {
              timeZone: "America/Chicago",
              weekday: "short",
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </span>
        </div>
      </div>

      {isTall ? (
        <div className="flex flex-col gap-4">
          <SmlFlyView
            session={smlSession}
            onSessionCreated={setSmlSession}
            selectedDate={selectedDate}
            flySnapshots={flySnapshots}
            isTall={true}
            onEntryEdit={patchEntryMid}
          />
          <div className="border-t border-[#1a1a1a]" />
          <StraddleView data={straddleData} selectedDate={selectedDate} />
          <div className="border-t border-[#1a1a1a]" />
          <SkewView data={skewSnapshots} selectedDate={selectedDate} />
          <div className="border-t border-[#1a1a1a]" />
          <PositionsView spxPrice={latestSpx} />
        </div>
      ) : (
        <div>
          {activeTab === "Straddle" && (
            <StraddleView data={straddleData} selectedDate={selectedDate} />
          )}
          {activeTab === "SML Fly" && (
            <SmlFlyView
              session={smlSession}
              onSessionCreated={setSmlSession}
              selectedDate={selectedDate}
              flySnapshots={flySnapshots}
              isTall={false}
              onEntryEdit={patchEntryMid}
            />
          )}
          {activeTab === "Skew" && (
            <SkewView data={skewSnapshots} selectedDate={selectedDate} />
          )}
          {activeTab === "Posições" && <PositionsView spxPrice={latestSpx} />}
        </div>
      )}
    </div>
  );
}
