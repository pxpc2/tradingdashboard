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

  return (
    <div className="flex flex-col gap-6">
      {/* Straddle metrics */}
      <div className="flex items-baseline gap-6 flex-nowrap overflow-x-auto pb-1 border-b border-[#222]">
        <div className="flex items-baseline gap-1.5 shrink-0">
          <span className="font-sans text-[9px] text-[#444] uppercase tracking-widest">
            Straddle
          </span>
          <span className="font-mono font-light text-xl text-[#9ca3af]">
            ${latestStraddle?.straddle_mid?.toFixed(2) ?? "—"}
          </span>
        </div>
        {openingStraddle && (
          <>
            <div className="w-px h-4 bg-[#1f1f1f] shrink-0" />
            <div className="flex items-baseline gap-1.5 shrink-0">
              <span className="font-sans text-[9px] text-[#444] uppercase tracking-widest">
                Implied
              </span>
              <span className="font-mono font-light text-xl text-[#9ca3af]">
                ${openingStraddle.straddle_mid.toFixed(2)}
              </span>
            </div>
          </>
        )}
        {openingStraddle &&
          latestStraddle &&
          (() => {
            const realizedPts = Math.abs(
              latestStraddle.spx_ref - openingStraddle.spx_ref,
            );
            const realizedPct =
              openingStraddle.straddle_mid > 0
                ? ((realizedPts / openingStraddle.straddle_mid) * 100).toFixed(
                    0,
                  )
                : null;
            const color =
              realizedPct && parseInt(realizedPct) >= 100
                ? "#f87171"
                : realizedPct && parseInt(realizedPct) >= 70
                  ? "#f59e0b"
                  : "#9ca3af";
            return (
              <>
                <div className="w-px h-4 bg-[#1f1f1f] shrink-0" />
                <div className="flex items-baseline gap-1.5 shrink-0">
                  <span className="font-sans text-[9px] text-[#444] uppercase tracking-widest">
                    Realized
                  </span>
                  <span
                    className="font-mono font-light text-xl"
                    style={{ color }}
                  >
                    {realizedPts.toFixed(1)}pts
                  </span>
                  {realizedPct && (
                    <span className="font-mono text-xs" style={{ color }}>
                      ({realizedPct}%)
                    </span>
                  )}
                </div>
              </>
            );
          })()}
      </div>

      {/* Straddle chart */}
      <div>
        <div className="flex items-center gap-3 mb-3">
          <div className="w-0.5 h-4 bg-[#2a2a2a]" style={{ borderRadius: 0 }} />
          <span className="font-sans text-[9px] text-[#444] uppercase tracking-widest">
            Straddle
          </span>
        </div>
        <StraddleChart data={straddleData} selectedDate={selectedDate} />
      </div>

      <div className="border-t border-[#222]" />

      {/* Skew metrics */}
      <div className="flex items-baseline gap-6 flex-nowrap overflow-x-auto pb-1 border-b border-[#222]">
        <div className="flex items-baseline gap-1.5 shrink-0">
          <span className="font-sans text-[9px] text-[#444] uppercase tracking-widest">
            Skew
          </span>
          <span className="font-mono font-light text-xl text-[#9ca3af]">
            {latestSkew?.skew?.toFixed(4) ?? "—"}
          </span>
        </div>
        <div className="w-px h-4 bg-[#1f1f1f] shrink-0" />
        <div className="flex items-baseline gap-1.5 shrink-0">
          <span className="font-sans text-[9px] text-[#444] uppercase tracking-widest">
            Call IV
          </span>
          <span className="font-mono font-light text-xl text-[#9ca3af]">
            {latestSkew ? `${(latestSkew.call_iv * 100).toFixed(1)}` : "—"}
          </span>
        </div>
        <div className="w-px h-4 bg-[#1f1f1f] shrink-0" />
        <div className="flex items-baseline gap-1.5 shrink-0">
          <span className="font-sans text-[9px] text-[#444] uppercase tracking-widest">
            ATM IV
          </span>
          <span className="font-mono font-light text-xl text-[#9ca3af]">
            {latestSkew ? `${(latestSkew.atm_iv * 100).toFixed(1)}` : "—"}
          </span>
        </div>
        <div className="w-px h-4 bg-[#1f1f1f] shrink-0" />
        <div className="flex items-baseline gap-1.5 shrink-0">
          <span className="font-sans text-[9px] text-[#444] uppercase tracking-widest">
            Put IV
          </span>
          <span className="font-mono font-light text-xl text-[#9ca3af]">
            {latestSkew ? `${(latestSkew.put_iv * 100).toFixed(1)}` : "—"}
          </span>
        </div>
      </div>

      {/* Skew chart */}
      <div>
        <div className="flex items-center gap-3 mb-3">
          <div className="w-0.5 h-4 bg-[#2a2a2a]" style={{ borderRadius: 0 }} />
          <span className="font-sans text-[9px] text-[#444] uppercase tracking-widest">
            Skew
          </span>
        </div>
        <SkewChart data={skewSnapshots} selectedDate={selectedDate} />
      </div>
    </div>
  );
}
