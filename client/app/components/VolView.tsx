"use client";

import StraddleChart from "./StraddleChart";
import SkewChart from "./SkewChart";
import { StraddleSnapshot, SkewSnapshot } from "../types";

type Props = {
  straddleData: StraddleSnapshot[];
  skewSnapshots: SkewSnapshot[];
  selectedDate: string;
};

export default function VolView({
  straddleData,
  skewSnapshots,
  selectedDate,
}: Props) {
  const latestStraddle = straddleData[straddleData.length - 1];
  const openingStraddle = straddleData[0];
  const latestSkew = skewSnapshots[skewSnapshots.length - 1];

  const realizedPts =
    latestStraddle && openingStraddle
      ? Math.abs(latestStraddle.spx_ref - openingStraddle.spx_ref)
      : null;
  const realizedPct =
    realizedPts !== null && openingStraddle && openingStraddle.straddle_mid > 0
      ? ((realizedPts / openingStraddle.straddle_mid) * 100).toFixed(0)
      : null;
  const realizedColor =
    realizedPct && parseInt(realizedPct) >= 100
      ? "#f87171"
      : realizedPct && parseInt(realizedPct) >= 70
        ? "#f59e0b"
        : "#9ca3af";

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      {/* Mobile IV hero cards */}
      <div className="grid grid-cols-3 gap-3 md:hidden">
        <div className="bg-[#111] rounded-sm p-3">
          <div className="font-sans text-[9px] text-[#555] uppercase tracking-widest mb-1">
            IV30
          </div>
          <div className="font-mono font-light text-xl text-[#9ca3af]">
            {latestSkew ? (latestSkew.atm_iv * 100).toFixed(1) : "—"}
          </div>
        </div>
        <div className="bg-[#111] rounded-sm p-3">
          <div className="font-sans text-[9px] text-[#555] uppercase tracking-widest mb-1">
            Skew
          </div>
          <div className="font-mono font-light text-xl text-[#9ca3af]">
            {latestSkew?.skew?.toFixed(3) ?? "—"}
          </div>
        </div>
        <div className="bg-[#111] rounded-sm p-3">
          <div className="font-sans text-[9px] text-[#555] uppercase tracking-widest mb-1">
            Put IV
          </div>
          <div className="font-mono font-light text-xl text-[#9ca3af]">
            {latestSkew ? (latestSkew.put_iv * 100).toFixed(1) : "—"}
          </div>
          <div className="font-mono text-[10px] text-[#444] mt-1">
            call {latestSkew ? (latestSkew.call_iv * 100).toFixed(1) : "—"}
          </div>
        </div>
      </div>

      {/* Straddle metrics strip */}
      <div className="flex items-baseline gap-6 flex-nowrap overflow-x-auto pb-1 border-b border-[#222]">
        <div className="flex items-baseline gap-1.5 shrink-0">
          <span className="font-sans text-[11px] text-[#666] uppercase tracking-widest">
            Straddle
          </span>
          <span className="font-mono font-light text-lg text-[#9ca3af]">
            ${latestStraddle?.straddle_mid?.toFixed(2) ?? "—"}
          </span>
        </div>
        {openingStraddle && (
          <>
            <div className="w-px h-4 bg-[#1f1f1f] shrink-0" />
            <div className="flex items-baseline gap-1.5 shrink-0">
              <span className="font-sans text-[11px] text-[#666] uppercase tracking-widest">
                Implied
              </span>
              <span className="font-mono font-light text-lg text-[#9ca3af]">
                ${openingStraddle.straddle_mid.toFixed(2)}
              </span>
            </div>
          </>
        )}
        {realizedPts !== null && (
          <>
            <div className="w-px h-4 bg-[#1f1f1f] shrink-0" />
            <div className="flex items-baseline gap-1.5 shrink-0">
              <span className="font-sans text-[11px] text-[#666] uppercase tracking-widest">
                Realized
              </span>
              <span
                className="font-mono font-light text-lg"
                style={{ color: realizedColor }}
              >
                {realizedPts.toFixed(1)}pts
              </span>
              {realizedPct && (
                <span
                  className="font-mono text-xs"
                  style={{ color: realizedColor }}
                >
                  ({realizedPct}%)
                </span>
              )}
            </div>
          </>
        )}
      </div>

      {/* Straddle chart — desktop only */}
      <div className="hidden md:block">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-0.5 h-4 bg-[#2a2a2a]" style={{ borderRadius: 0 }} />
          <span className="font-sans text-[11px] text-[#666] uppercase tracking-widest">
            Straddle
          </span>
        </div>
        <StraddleChart data={straddleData} selectedDate={selectedDate} />
      </div>

      {/* Mobile straddle table */}
      <div className="md:hidden">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-0.5 h-4 bg-[#2a2a2a]" style={{ borderRadius: 0 }} />
          <span className="font-sans text-[10px] text-[#666] uppercase tracking-widest">
            Straddle history
          </span>
        </div>
        <div className="grid grid-cols-3 gap-2 pb-1 border-b border-[#1a1a1a] mb-1">
          <span className="font-sans text-[9px] text-[#444] uppercase tracking-widest">
            Time CT
          </span>
          <span className="font-sans text-[9px] text-[#444] uppercase tracking-widest">
            Strike
          </span>
          <span className="font-sans text-[9px] text-[#444] uppercase tracking-widest text-right">
            Mid
          </span>
        </div>
        {straddleData
          .slice(-8)
          .reverse()
          .map((s, i) => (
            <div
              key={i}
              className="grid grid-cols-3 gap-2 py-1.5 border-b border-[#111]"
            >
              <span className="font-mono text-[11px] text-[#555]">
                {new Date(s.created_at).toLocaleTimeString("en-US", {
                  timeZone: "America/Chicago",
                  hour: "2-digit",
                  minute: "2-digit",
                  hour12: false,
                })}
              </span>
              <span className="font-mono text-[11px] text-[#666]">
                {s.atm_strike}
              </span>
              <span className="font-mono text-[11px] text-[#9ca3af] text-right">
                ${s.straddle_mid.toFixed(2)}
              </span>
            </div>
          ))}
      </div>

      <div className="border-t border-[#222]" />

      {/* Skew metrics strip */}
      <div className="flex items-baseline gap-6 flex-nowrap overflow-x-auto pb-1 border-b border-[#222]">
        <div className="flex items-baseline gap-1.5 shrink-0">
          <span className="font-sans text-[11px] text-[#666] uppercase tracking-widest">
            Skew
          </span>
          <span className="font-mono font-light text-lg text-[#9ca3af]">
            {latestSkew?.skew?.toFixed(4) ?? "—"}
          </span>
        </div>
        <div className="w-px h-4 bg-[#1f1f1f] shrink-0" />
        <div className="flex items-baseline gap-1.5 shrink-0">
          <span className="font-sans text-[11px] text-[#666] uppercase tracking-widest">
            Call IV
          </span>
          <span className="font-mono font-light text-lg text-[#9ca3af]">
            {latestSkew ? `${(latestSkew.call_iv * 100).toFixed(1)}` : "—"}
          </span>
        </div>
        <div className="w-px h-4 bg-[#1f1f1f] shrink-0" />
        <div className="flex items-baseline gap-1.5 shrink-0">
          <span className="font-sans text-[11px] text-[#666] uppercase tracking-widest">
            ATM IV
          </span>
          <span className="font-mono font-light text-lg text-[#9ca3af]">
            {latestSkew ? `${(latestSkew.atm_iv * 100).toFixed(1)}` : "—"}
          </span>
        </div>
        <div className="w-px h-4 bg-[#1f1f1f] shrink-0" />
        <div className="flex items-baseline gap-1.5 shrink-0">
          <span className="font-sans text-[11px] text-[#666] uppercase tracking-widest">
            Put IV
          </span>
          <span className="font-mono font-light text-lg text-[#9ca3af]">
            {latestSkew ? `${(latestSkew.put_iv * 100).toFixed(1)}` : "—"}
          </span>
        </div>
      </div>

      {/* Skew chart — desktop only */}
      <div className="hidden md:block">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-0.5 h-4 bg-[#2a2a2a]" style={{ borderRadius: 0 }} />
          <span className="font-sans text-[11px] text-[#666] uppercase tracking-widest">
            Skew
          </span>
        </div>
        <SkewChart data={skewSnapshots} selectedDate={selectedDate} />
      </div>
    </div>
  );
}
