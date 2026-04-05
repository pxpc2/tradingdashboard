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
      <div className="flex items-baseline gap-8">
        <div>
          <span className="text-xs text-gray-400 uppercase tracking-wide mr-2">
            Straddle
          </span>
          <span className="text-2xl font-medium text-gray-400">
            ${latestStraddle?.straddle_mid?.toFixed(2) ?? "—"}
          </span>
        </div>
        {openingStraddle && (
          <div>
            <span className="text-xs text-gray-400 uppercase tracking-wide mr-2">
              Implied Move
            </span>
            <span className="text-2xl font-medium text-gray-400">
              ${openingStraddle.straddle_mid.toFixed(2)}
            </span>
          </div>
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
              <div>
                <span className="text-xs text-gray-400 uppercase tracking-wide mr-2">
                  Realized
                </span>
                <span className="text-2xl font-medium" style={{ color }}>
                  {realizedPts.toFixed(1)}pts
                </span>
                {realizedPct && (
                  <span className="text-lg font-medium ml-2" style={{ color }}>
                    ({realizedPct}%)
                  </span>
                )}
              </div>
            );
          })()}
      </div>

      {/* Straddle chart — decay curve will be overlaid here eventually */}
      <div>
        <div className="text-xs text-[#333] uppercase tracking-widest mb-3">
          Straddle
        </div>
        <StraddleChart data={straddleData} selectedDate={selectedDate} />
      </div>

      <div className="border-t border-[#1a1a1a]" />

      {/* Skew metrics */}
      <div className="flex items-baseline gap-8">
        <div>
          <span className="text-xs text-gray-400 uppercase tracking-wide mr-2">
            Skew
          </span>
          <span className="text-2xl font-medium text-gray-400">
            {latestSkew?.skew?.toFixed(4) ?? "—"}
          </span>
        </div>
        <div>
          <span className="text-xs text-gray-400 uppercase tracking-wide mr-2">
            Call IV
          </span>
          <span className="text-2xl font-medium text-gray-400">
            {latestSkew ? `${(latestSkew.call_iv * 100).toFixed(1)}` : "—"}
          </span>
        </div>
        <div>
          <span className="text-xs text-gray-400 uppercase tracking-wide mr-2">
            ATM IV
          </span>
          <span className="text-2xl font-medium text-gray-400">
            {latestSkew ? `${(latestSkew.atm_iv * 100).toFixed(1)}` : "—"}
          </span>
        </div>
        <div>
          <span className="text-xs text-gray-400 uppercase tracking-wide mr-2">
            Put IV
          </span>
          <span className="text-2xl font-medium text-gray-400">
            {latestSkew ? `${(latestSkew.put_iv * 100).toFixed(1)}` : "—"}
          </span>
        </div>
      </div>

      {/* Skew chart — intraday for now, will become historical */}
      <div>
        <div className="text-xs text-[#333] uppercase tracking-widest mb-3">
          Skew
        </div>
        <SkewChart data={skewSnapshots} selectedDate={selectedDate} />
      </div>
    </div>
  );
}
