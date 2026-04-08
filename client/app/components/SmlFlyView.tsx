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
          <span className="font-sans text-[9px] text-[#444] uppercase tracking-widest">
            SML Strike
          </span>
          <input
            type="number"
            value={strike}
            onChange={(e) => setStrike(e.target.value)}
            placeholder="6620"
            className="font-mono bg-[#0a0a0a] border border-[#1f1f1f] rounded-sm px-3 py-2 text-sm text-white w-full"
          />
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex gap-0 border border-[#1f1f1f] rounded-sm w-fit overflow-hidden">
            {(["call", "put"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setOptionType(t)}
                className={`font-sans px-5 py-1.5 text-xs uppercase tracking-widest transition-colors hover:cursor-pointer ${
                  optionType === t
                    ? "bg-[#1f1f1f] text-[#888]"
                    : "text-[#333] hover:text-[#555]"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <span className="font-sans text-[9px] text-[#444] uppercase tracking-widest">
            Widths to track
          </span>
          <div className="flex gap-2 flex-wrap">
            {WIDTH_OPTIONS.map((w) => (
              <button
                key={w}
                onClick={() => toggleWidth(w)}
                className={`font-mono px-3 py-1.5 text-xs border transition-colors hover:cursor-pointer rounded-sm ${
                  selectedWidths.includes(w)
                    ? "bg-[#1f1f1f] text-[#888] border-[#333]"
                    : "bg-transparent text-[#333] border-[#1f1f1f] hover:text-[#555]"
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
          className="font-sans text-xs uppercase tracking-widest bg-white text-black py-2 px-6 rounded-sm hover:bg-gray-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed hover:cursor-pointer"
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
      {/* Width tabs — underline style */}
      <div className="flex items-center border-b border-[#1a1a1a] mb-4">
        {widths.map((w) => (
          <button
            key={w}
            onClick={() => setActiveWidth(w)}
            className={`font-mono text-xs px-4 py-2 border-b-2 transition-colors hover:cursor-pointer ${
              effectiveActiveWidth === w
                ? "border-[#555] text-[#888]"
                : "border-transparent text-[#333] hover:text-[#555]"
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
              visibility: effectiveActiveWidth === w ? "visible" : "hidden",
              height: effectiveActiveWidth === w ? "auto" : "0",
              overflow: "hidden",
            }}
          >
            {/* Metric strip */}
            <div className="flex items-baseline gap-6 flex-nowrap overflow-x-auto pb-3 mb-4 border-b border-[#222]">
              <div className="flex items-baseline gap-1.5 shrink-0">
                <span className="font-sans text-[9px] text-[#444] uppercase tracking-widest">
                  Entrada
                </span>
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
                    className="font-mono font-light text-xl text-[#9ca3af] bg-transparent border-b border-[#444] outline-none w-24"
                  />
                ) : (
                  <span
                    className="font-mono font-light text-xl text-[#9ca3af] cursor-pointer hover:text-white transition-colors"
                    title="Editar entry mid price"
                    onClick={() => {
                      if (!entry) return;
                      setEditingId(entry.id);
                      setEditingValue(entry.mid.toFixed(2));
                    }}
                  >
                    {entry ? entry.mid.toFixed(2) : "—"}
                  </span>
                )}
              </div>

              <div className="w-px h-4 bg-[#1f1f1f] shrink-0" />

              <div className="flex items-baseline gap-1.5 shrink-0">
                <span className="font-sans text-[9px] text-[#444] uppercase tracking-widest">
                  Bid
                </span>
                <span className="font-mono font-light text-xl text-[#9ca3af]">
                  {latest ? latest.bid.toFixed(2) : "—"}
                </span>
              </div>

              <div className="w-px h-4 bg-[#1f1f1f] shrink-0" />

              <div className="flex items-baseline gap-1.5 shrink-0">
                <span className="font-sans text-[9px] text-[#444] uppercase tracking-widest">
                  Mid
                </span>
                <span className="font-mono font-light text-xl text-[#9ca3af]">
                  {latest ? latest.mid.toFixed(2) : "—"}
                </span>
              </div>

              <div className="w-px h-4 bg-[#1f1f1f] shrink-0" />

              <div className="flex items-baseline gap-1.5 shrink-0">
                <span className="font-sans text-[9px] text-[#444] uppercase tracking-widest">
                  Ask
                </span>
                <span className="font-mono font-light text-xl text-[#9ca3af]">
                  {latest ? latest.ask.toFixed(2) : "—"}
                </span>
              </div>

              <div className="w-px h-4 bg-[#1f1f1f] shrink-0" />

              <div className="flex items-baseline gap-1.5 shrink-0">
                <span className="font-sans text-[9px] text-[#444] uppercase tracking-widest">
                  PnL
                </span>
                <span
                  className="font-mono font-light text-xl"
                  style={{
                    color:
                      pnl === null ? "#444" : pnl >= 0 ? "#4ade80" : "#f87171",
                  }}
                >
                  {pnl === null
                    ? "—"
                    : `${pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}`}
                </span>
              </div>

              <div className="ml-auto shrink-0">
                <span className="font-mono text-[9px] text-[#333]">
                  {smlStrike - w}
                  {sessionType === "call" ? "C" : "P"} · {smlStrike}
                  {sessionType === "call" ? "C" : "P"} · {smlStrike + w}
                  {sessionType === "call" ? "C" : "P"}
                </span>
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
