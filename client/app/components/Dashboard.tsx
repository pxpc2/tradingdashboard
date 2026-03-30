"use client";

import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import StraddleChart from "./StraddleChart";
import FlyChart from "./FlyChart";

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

type RtmSession = {
  id: string;
  created_at: string;
  sml_ref: number | null;
  sal_ref: number | null;
  widths: number[] | null;
  type: string | null;
};

type FlySnapshot = {
  id: string;
  created_at: string;
  session_id: string;
  width: number;
  mid: number;
  bid: number;
  ask: number;
};

type Props = {
  initialStraddleData: StraddleSnapshot[];
  initialSmlSession: RtmSession | null;
};

const TABS = ["Straddle", "SML Fly", "SAL Fly"] as const;
type Tab = (typeof TABS)[number];

const WIDTH_OPTIONS = [10, 15, 20, 25, 30];
const WIDTH_COLORS: Record<number, string> = {
  10: "#60a5fa",
  15: "#9CA9FF",
  20: "#fb923c",
  25: "#34d399",
  30: "#f472b6",
};

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
  const [activeFlyTab, setActiveFlyTab] = useState<"SML" | "SAL">("SML");
  const [straddleData, setStraddleData] =
    useState<StraddleSnapshot[]>(initialStraddleData);
  const [smlSession, setSmlSession] = useState<RtmSession | null>(
    initialSmlSession,
  );
  const [flySnapshots, setFlySnapshots] = useState<FlySnapshot[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>(
    new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" }),
  );
  const isTall = useIsTallMode();

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const { data: straddleData } = await supabase
        .from("straddle_snapshots")
        .select("*")
        .gte("created_at", `${selectedDate}T00:00:00`)
        .lt("created_at", `${selectedDate}T23:59:59`)
        .order("created_at", { ascending: true });

      const { data: sessions } = await supabase
        .from("rtm_sessions")
        .select("*")
        .gte("created_at", `${selectedDate}T00:00:00`)
        .lt("created_at", `${selectedDate}T23:59:59`)
        .order("created_at", { ascending: false })
        .limit(1);

      const session = sessions?.[0] ?? null;

      let flyData: FlySnapshot[] = [];
      if (session) {
        const { data: snaps } = await supabase
          .from("sml_fly_snapshots")
          .select("*")
          .eq("session_id", session.id)
          .order("created_at", { ascending: true });
        flyData = snaps ?? [];
      }

      if (!cancelled) {
        if (straddleData) setStraddleData(straddleData);
        setSmlSession(session);
        setFlySnapshots(flyData);
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [selectedDate]);

  // Realtime for straddle
  useEffect(() => {
    const today = new Date().toLocaleDateString("en-CA", {
      timeZone: "America/New_York",
    });

    const channel = supabase
      .channel("straddle_realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "straddle_snapshots" },
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

  // Realtime for fly snapshots
  useEffect(() => {
    const today = new Date().toLocaleDateString("en-CA", {
      timeZone: "America/New_York",
    });

    const channel = supabase
      .channel("fly_realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "sml_fly_snapshots" },
        (payload) => {
          if (selectedDate === today) {
            setFlySnapshots((prev) => [...prev, payload.new as FlySnapshot]);
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
      <div className="flex items-center justify-between mb-6">
        {isTall ? (
          <div className="flex gap-1 rounded-sm bg-[#111111] p-1">
            {(["SML Fly", "SAL Fly"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() =>
                  setActiveFlyTab(tab === "SML Fly" ? "SML" : "SAL")
                }
                className={`px-5 py-2 rounded-sm text-sm font-medium transition-colors ${
                  activeFlyTab === (tab === "SML Fly" ? "SML" : "SAL")
                    ? "bg-[#1f1f1f] text-white"
                    : "text-[#444444] hover:cursor-pointer hover:text-[#888888]"
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
        ) : (
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

      {isTall ? (
        <div className="flex flex-col gap-4">
          <div className="bg-[#111111] rounded-sm p-4">
            <SmlFlyView
              session={smlSession}
              onSessionCreated={setSmlSession}
              selectedDate={selectedDate}
              type={activeFlyTab}
              flySnapshots={flySnapshots}
            />
          </div>
          <div className="border-t border-[#1a1a1a]" />
          <StraddleView data={straddleData} selectedDate={selectedDate} />
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
              type="SML"
              flySnapshots={flySnapshots}
            />
          )}
          {activeTab === "SAL Fly" && (
            <SmlFlyView
              session={smlSession}
              onSessionCreated={setSmlSession}
              selectedDate={selectedDate}
              type="SAL"
              flySnapshots={flySnapshots}
            />
          )}
        </div>
      )}
    </div>
  );
}

function StraddleView({
  data,
  selectedDate,
}: {
  data: StraddleSnapshot[];
  selectedDate: string;
}) {
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

function SmlFlyView({
  session,
  onSessionCreated,
  selectedDate,
  type,
  flySnapshots,
}: {
  session: RtmSession | null;
  onSessionCreated: (session: RtmSession) => void;
  selectedDate: string;
  type: "SML" | "SAL";
  flySnapshots: FlySnapshot[];
}) {
  const [strike, setStrike] = useState("");
  const [optionType, setOptionType] = useState<"call" | "put">("call");
  const [selectedWidths, setSelectedWidths] = useState<number[]>([10, 15, 20]);
  const [activeWidth, setActiveWidth] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const widths = session?.widths ?? [];
  const effectiveActiveWidth = activeWidth ?? widths[0] ?? 10;

  async function handleSubmit() {
    if (!strike || selectedWidths.length === 0) return;
    setSubmitting(true);

    const insertData =
      type === "SML"
        ? {
            sml_ref: parseFloat(strike),
            widths: selectedWidths,
            type: optionType,
          }
        : {
            sal_ref: parseFloat(strike),
            widths: selectedWidths,
            type: optionType,
          };

    const { data, error } = await supabase
      .from("rtm_sessions")
      .insert(insertData)
      .select()
      .single();

    if (!error && data) {
      setActiveWidth(null);
      onSessionCreated(data as RtmSession);
    }
    setSubmitting(false);
  }

  function toggleWidth(w: number) {
    setSelectedWidths((prev) =>
      prev.includes(w) ? prev.filter((x) => x !== w) : [...prev, w],
    );
  }

  const sessionRef = type === "SML" ? session?.sml_ref : session?.sal_ref;
  const hasSession = sessionRef != null;

  if (!hasSession) {
    return (
      <div className="flex flex-col gap-5 max-w-sm">
        <div className="flex flex-col gap-2">
          <span className="text-xs text-[#444] uppercase tracking-wide">
            {type} strike
          </span>
          <input
            type="number"
            value={strike}
            onChange={(e) => setStrike(e.target.value)}
            placeholder="6620"
            className="bg-[#0a0a0a] border border-[#1f1f1f] rounded-sm px-3 py-2 text-sm text-white w-full"
          />
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex gap-1 bg-[#0a0a0a] rounded-sm p-1 w-fit">
            {(["call", "put"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setOptionType(t)}
                className={`px-4 py-1.5 rounded-sm text-sm font-medium transition-colors hover:cursor-pointer ${
                  optionType === t
                    ? "bg-[#1f1f1f] text-white"
                    : "text-[#444444] hover:text-[#888888]"
                }`}
              >
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-xs text-[#444] uppercase tracking-wide">
            WIDTHS p/ acompanhar:
          </span>
          <div className="flex gap-2 flex-wrap">
            {WIDTH_OPTIONS.map((w) => (
              <button
                key={w}
                onClick={() => toggleWidth(w)}
                className={`px-3 py-1.5 rounded-sm text-sm border transition-colors hover:cursor-pointer ${
                  selectedWidths.includes(w)
                    ? "bg-[#1f1f1f] text-white border-[#333]"
                    : "bg-transparent text-[#444] border-[#1f1f1f] hover:text-[#888]"
                }`}
              >
                {w}W
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={handleSubmit}
          disabled={submitting || !strike || selectedWidths.length === 0}
          className="bg-white text-black text-sm font-medium py-2 px-6 rounded-sm hover:bg-gray-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed hover:cursor-pointer"
        >
          {submitting ? "Inicializando sessão..." : "Criar RTM session pro dia"}
        </button>
      </div>
    );
  }

  const smlStrike = sessionRef ?? 0;
  const sessionType = session?.type ?? "call";

  return (
    <div>
      <div className="flex items-center gap-6 mb-4">
        <div>
          <span className="text-base font-medium">
            {smlStrike}
            {sessionType === "call" ? "C" : "P"}
          </span>
        </div>
        <div>
          <span className="text-sm text-[#888]">
            {widths.map((w) => `${w}W`).join(" · ")}
          </span>
        </div>
      </div>

      <div className="flex gap-1 bg-[#0a0a0a] rounded-sm p-1 w-fit mb-4">
        {widths.map((w) => (
          <button
            key={w}
            onClick={() => setActiveWidth(w)}
            className={`px-4 py-1.5 rounded-sm text-sm font-medium transition-colors ${
              effectiveActiveWidth === w
                ? "bg-[#1f1f1f] text-white"
                : "text-[#444444] hover:text-[#888888]"
            }`}
          >
            {w}W
          </button>
        ))}
      </div>

      {widths.map((w) => {
        const widthSnapshots = flySnapshots.filter((s) => s.width === w);
        const latest = widthSnapshots[widthSnapshots.length - 1];
        const entry = widthSnapshots[0];
        const pnl = latest && entry ? latest.mid - entry.mid : null;
        const color = WIDTH_COLORS[w] ?? "#888";

        return (
          <div
            key={w}
            style={{ display: effectiveActiveWidth === w ? "block" : "none" }}
          >
            <div className="bg-[#0a0a0a] rounded-sm p-4">
              <div className="flex items-baseline justify-between mb-4">
                <div className="flex items-baseline gap-8">
                  <div>
                    <div className="text-xs text-[#444] uppercase tracking-wide mb-1">
                      PnL
                    </div>
                    <div
                      className="text-2xl font-medium"
                      style={{
                        color:
                          pnl === null
                            ? "#888"
                            : pnl >= 0
                              ? "#4ade80"
                              : "#f87171",
                      }}
                    >
                      {pnl === null
                        ? "—"
                        : `${pnl >= 0 ? "+" : ""}$${(pnl * 100).toFixed(0)}`}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-[#444] uppercase tracking-wide mb-1">
                      Entry mid
                    </div>
                    <div className="text-sm font-medium text-[#888]">
                      {entry ? entry.mid.toFixed(2) : "—"}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-[#444] uppercase tracking-wide mb-1">
                      Bid / Mid / Ask
                    </div>
                    <div className="text-sm font-medium text-[#888]">
                      {latest
                        ? `${latest.bid.toFixed(2)} / ${latest.mid.toFixed(2)} / ${latest.ask.toFixed(2)}`
                        : "— / — / —"}
                    </div>
                  </div>
                </div>
                <div className="text-xs text-[#444]">
                  {smlStrike - w}
                  {sessionType === "call" ? "C" : "P"} · {smlStrike}
                  {sessionType === "call" ? "C" : "P"} · {smlStrike + w}
                  {sessionType === "call" ? "C" : "P"}
                </div>
              </div>
              <FlyChart
                data={widthSnapshots}
                width={w}
                color={color}
                selectedDate={selectedDate}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function FlyView({ type }: { type: "SAL" }) {
  return (
    <div className="bg-[#1A1A1A] rounded-sm p-4 h-96 flex items-center justify-center text-gray-500">
      {type} P&L Chart
    </div>
  );
}
