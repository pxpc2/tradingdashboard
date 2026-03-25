"use client";

import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import StraddleChart from "./StraddleChart";

type StraddleSnapshot = {
  id: string;
  created_at: string;
  spx_ref: number;
  atm_strike: number;
  call_bid: number;
  call_ask: number;
  put_bid: number;
  put_ask: number;
  straddle_mid: number;
};

type Props = {
  initialStraddleData: StraddleSnapshot[];
};

const TABS = ["Straddle", "SML Fly", "SAL Fly"] as const;
type Tab = (typeof TABS)[number];

export default function Dashboard({ initialStraddleData }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>("Straddle");
  const [straddleData, setStraddleData] =
    useState<StraddleSnapshot[]>(initialStraddleData);
  const [selectedDate, setSelectedDate] = useState<string>(
    new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" }),
  );

  // Refetch when date changes
  useEffect(() => {
    let cancelled = false;

    async function load() {
      const { data } = await supabase
        .from("straddle_snapshots")
        .select("*")
        .gte("created_at", `${selectedDate}T00:00:00`)
        .lt("created_at", `${selectedDate}T23:59:59`)
        .order("created_at", { ascending: true });

      if (!cancelled && data) setStraddleData(data);
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [selectedDate]);

  // Realtime subscription — only append if viewing today
  useEffect(() => {
    const today = new Date().toLocaleDateString("en-CA", {
      timeZone: "America/New_York",
    });

    const channel = supabase
      .channel("straddle_snapshots")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "straddle_snapshots",
        },
        (payload) => {
          if (selectedDate === today) {
            setStraddleData((prev) => [
              ...prev,
              payload.new as StraddleSnapshot,
            ]);
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedDate]);

  return (
    <div className="max-w-7xl mx-auto px-6 py-6">
      {/* Top bar */}
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

      {/* Tab content */}
      <div>
        {activeTab === "Straddle" && <StraddleView data={straddleData} selectedDate={selectedDate} />}
        {activeTab === "SML Fly" && <FlyView type="SML" />}
        {activeTab === "SAL Fly" && <FlyView type="SAL" />}
      </div>
    </div>
  );
}

function StraddleView({ data, selectedDate  }: { data: StraddleSnapshot[], selectedDate: string }) {
  const latest = data[data.length - 1];

  return (
    <div>
      <div className="flex items-baseline gap-8 mb-6">
        <div>
          <span className="text-xs text-gray-400 uppercase tracking-wide mr-2">
            SPX
          </span>
          <span className="text-2xl font-medium">
            {latest?.spx_ref?.toFixed(2) ?? "—"}
          </span>
        </div>
        <div>
          <span className="text-xs text-gray-400 uppercase tracking-wide mr-2">
            Straddle
          </span>
          <span className="text-2xl font-medium">
            {latest?.straddle_mid?.toFixed(2) ?? "—"}
          </span>
        </div>
      </div>
      <StraddleChart data={data} selectedDate={selectedDate} />
    </div>
  );
}

function FlyView({ type }: { type: "SML" | "SAL" }) {
  return (
    <div className="bg-[#1A1A1A] rounded-sm p-4 h-96 flex items-center justify-center text-gray-500">
      {type} P&L Chart
    </div>
  );
}
