"use client";

import { useState, useEffect, useRef } from "react";
import MktView from "./MktView";
import VolView from "./VolView";
import PosView from "./PosView";
import { useStraddleData } from "../hooks/useStraddleData";
import { useFlyData } from "../hooks/useFlyData";
import { useSkewData } from "../hooks/useSkewData";
import { useEsData } from "../hooks/useEsData";
import { signOut } from "../login/actions";
import { StraddleSnapshot, RtmSession, EsSnapshot } from "../types";
import { LuLogOut } from "react-icons/lu";

type Props = {
  initialStraddleData: StraddleSnapshot[];
  initialSmlSession: RtmSession | null;
};

const TABS = ["MKT", "VOL", "POS"] as const;
type Tab = (typeof TABS)[number];

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

function isToday(selectedDate: string): boolean {
  return (
    selectedDate ===
    new Date().toLocaleDateString("en-CA", {
      timeZone: "America/New_York",
    })
  );
}

function computeOvernightLevels(esData: EsSnapshot[], selectedDate: string) {
  const rthOpen = new Date(`${selectedDate}T13:30:00Z`).getTime(); // 09:30 ET = 13:30 UTC
  const globexOpen = rthOpen - 15.5 * 60 * 60 * 1000; // 18:00 ET prev day = 23:00 UTC prev day

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

  // ONH/ONL lifted here so it survives tab switches
  const [onh, setOnh] = useState<number | null>(null);
  const [onl, setOnl] = useState<number | null>(null);
  const onhOnlComputedRef = useRef(false);

  useEffect(() => {
    if (!isToday(selectedDate) || !isSpxOpen()) return;
    if (onhOnlComputedRef.current) return;
    if (esData.length === 0) return;

    const { onh: computedOnh, onl: computedOnl } = computeOvernightLevels(
      esData,
      selectedDate,
    );

    if (computedOnh === null || computedOnl === null) return;

    setOnh(computedOnh);
    setOnl(computedOnl);
    onhOnlComputedRef.current = true;
  }, [esData, selectedDate]);

  // Reset when date changes
  useEffect(() => {
    onhOnlComputedRef.current = false;
    setOnh(null);
    setOnl(null);
  }, [selectedDate]);

  const latestSpx = straddleData[straddleData.length - 1]?.spx_ref ?? 0;

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
          <span className="text-sm text-gray-400">
            {new Date().toLocaleDateString("en-US", {
              timeZone: "America/Chicago",
              weekday: "short",
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </span>
          <form action={signOut}>
            <button
              type="submit"
              className="text-lg hover:text-[#555] transition-colors hover:cursor-pointer"
            >
              <LuLogOut />
            </button>
          </form>
        </div>
      </div>

      {activeTab === "MKT" && (
        <MktView
          straddleData={straddleData}
          skewSnapshots={skewSnapshots}
          selectedDate={selectedDate}
          esBasis={esBasis}
          esData={esData}
          onh={onh}
          onl={onl}
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
