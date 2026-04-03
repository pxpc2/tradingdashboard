"use client";

import { useState } from "react";
import { supabase } from "../lib/supabase";
import FlyChart from "./FlyChart";
import { FlySnapshot, RtmSession } from "../types";

const WIDTH_OPTIONS = [10, 15, 20, 25, 30];
const WIDTH_COLORS: Record<number, string> = {
  10: "#60a5fa",
  15: "#9CA9FF",
  20: "#fb923c",
  25: "#34d399",
  30: "#f472b6",
};

type Props = {
  session: RtmSession | null;
  onSessionCreated: (session: RtmSession) => void;
  selectedDate: string;
  flySnapshots: FlySnapshot[];
  isTall: boolean;
  onEntryEdit: (snapshotId: string, newMid: number) => void;
};

export default function SmlFlyView({
  session,
  onSessionCreated,
  selectedDate,
  flySnapshots,
  isTall,
  onEntryEdit,
}: Props) {
  const [strike, setStrike] = useState("");
  const [optionType, setOptionType] = useState<"call" | "put">("call");
  const [selectedWidths, setSelectedWidths] = useState<number[]>([10, 15, 20]);
  const [activeWidth, setActiveWidth] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState<string>("");

  const widths = session?.widths ?? [];
  const effectiveActiveWidth = activeWidth ?? widths[0] ?? 10;

  async function handleSubmit() {
    if (!strike || selectedWidths.length === 0) return;
    setSubmitting(true);
    const { data, error } = await supabase
      .from("rtm_sessions")
      .insert({
        sml_ref: parseFloat(strike),
        widths: selectedWidths,
        type: optionType,
      })
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

  async function confirmEntryEdit(snapshotId: string) {
    const newMid = parseFloat(editingValue);
    if (isNaN(newMid) || newMid <= 0) {
      setEditingId(null);
      return;
    }
    await supabase
      .from("sml_fly_snapshots")
      .update({ mid: newMid })
      .eq("id", snapshotId);
    onEntryEdit(snapshotId, newMid);
    setEditingId(null);
  }

  const hasSession = session?.sml_ref != null;

  if (!hasSession) {
    return (
      <div className="flex flex-col gap-5 max-w-sm">
        <div className="flex flex-col gap-2">
          <span className="text-xs text-[#444] uppercase tracking-wide">
            SML strike
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
            Widths to track
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
          {submitting ? "Iniciando..." : "Iniciar tracking"}
        </button>
      </div>
    );
  }

  const smlStrike = session.sml_ref ?? 0;
  const sessionType = session?.type ?? "call";

  return (
    <div>
      <div className="flex gap-1 bg-[#111111] rounded-sm p-1 w-fit mb-4">
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
        const isEditing = !!entry && editingId === entry.id;

        return (
          <div
            key={w}
            style={{
              display: effectiveActiveWidth === w ? "block" : "block",
              visibility: effectiveActiveWidth === w ? "visible" : "hidden",
              height: effectiveActiveWidth === w ? "auto" : "0",
              overflow: "hidden",
            }}
          >
            <div className="flex items-baseline justify-between mb-4">
              <div className="flex items-baseline gap-8">
                <div>
                  <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">
                    Entrada
                  </div>
                  {isEditing ? (
                    <input
                      type="number"
                      step="0.01"
                      autoFocus
                      value={editingValue}
                      onChange={(e) => setEditingValue(e.target.value)}
                      onBlur={() => confirmEntryEdit(entry.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") confirmEntryEdit(entry.id);
                        if (e.key === "Escape") setEditingId(null);
                      }}
                      className="text-2xl font-medium text-gray-400 bg-transparent border-b border-[#444] outline-none w-24"
                    />
                  ) : (
                    <div
                      className="text-2xl font-medium text-gray-400 cursor-pointer hover:text-white transition-colors"
                      title="Editar entry mid price"
                      onClick={() => {
                        if (!entry) return;
                        setEditingId(entry.id);
                        setEditingValue(entry.mid.toFixed(2));
                      }}
                    >
                      {entry ? entry.mid.toFixed(2) : "—"}
                    </div>
                  )}
                </div>
                <div>
                  <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">
                    Bid / Mid / Ask
                  </div>
                  <div className="text-2xl font-medium text-gray-400">
                    {latest
                      ? `${latest.bid.toFixed(2)} / ${latest.mid.toFixed(2)} / ${latest.ask.toFixed(2)}`
                      : "— / — / —"}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">
                    PnL
                  </div>
                  <div className="text-2xl font-medium text-gray-400">
                    {pnl === null
                      ? "—"
                      : `${pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}`}
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
        );
      })}
    </div>
  );
}
