"use client";

import { useState, useEffect } from "react";
import LiveIndicator from "./LiveIndicator";
import MktView from "./MktView";
import VolView from "./VolView";
import PosView from "./PosView";
import { useStraddleData } from "../hooks/useStraddleData";
import { useFlyData } from "../hooks/useFlyData";
import { useSkewData } from "../hooks/useSkewData";
import { useEsData } from "../hooks/useEsData";
import { StraddleSnapshot, RtmSession } from "../types";

type Props = {
  initialStraddleData: StraddleSnapshot[];
  initialSmlSession: RtmSession | null;
};

const TABS = ["MKT", "VOL", "POS"] as const;
type Tab = (typeof TABS)[number];

export default function Dashboard({
  initialStraddleData,
  initialSmlSession,
}: Props) {
  const [activeTab, setActiveTab] = useState<Tab>("MKT");
  const [selectedDate, setSelectedDate] = useState<string>(
    new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" }),
  );

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

  const latestSpx = straddleData[straddleData.length - 1]?.spx_ref ?? 0;
  const lastStraddleTime =
    straddleData[straddleData.length - 1]?.created_at ?? null;
  const lastSkewTime =
    skewSnapshots[skewSnapshots.length - 1]?.created_at ?? null;

  return (
    <div className="max-w-7xl mx-auto px-6 py-6">
      <div className="flex items-center justify-between mb-6">
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
        <input
          type="date"
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
          className="bg-[#111111] text-[#444444] border border-[#1f1f1f] rounded-sm px-2 py-1 text-sm"
        />
        <div className="flex items-center gap-3">
          <LiveIndicator
            lastStraddleTime={lastStraddleTime}
            lastSkewTime={lastSkewTime}
            lastEsTime={lastEsTime}
            lastQuoteTime={null}
            hasActivePositions={false}
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

      {activeTab === "MKT" && (
        <MktView
          straddleData={straddleData}
          skewSnapshots={skewSnapshots}
          selectedDate={selectedDate}
          esBasis={esBasis}
          esData={esData}
        />
      )}
      {activeTab === "VOL" && (
        <VolView
          straddleData={straddleData}
          skewSnapshots={skewSnapshots}
          selectedDate={selectedDate}
        />
      )}
      {activeTab === "POS" && (
        <PosView
          smlSession={smlSession}
          onSessionCreated={setSmlSession}
          flySnapshots={flySnapshots}
          onEntryEdit={patchEntryMid}
          selectedDate={selectedDate}
          spxPrice={latestSpx}
        />
      )}
    </div>
  );
}
