"use client";

import { useState, useEffect } from "react";
import SpxChart from "./SpxChart";
import EsChart from "./EsChart";
import EsSpxConverter from "./Converter";
import { useLiveTick, ES_STREAMER_SYMBOL } from "../hooks/useLiveTick";
import { StraddleSnapshot, SkewSnapshot, EsSnapshot } from "../types";
type Props = {
  straddleData: StraddleSnapshot[];
  skewSnapshots: SkewSnapshot[];
  selectedDate: string;
  esBasis: number | null;
  esData: EsSnapshot[]; // add this
};

const LIVE_SYMBOLS = ["SPX", ES_STREAMER_SYMBOL];

export default function MktView({
  straddleData,
  skewSnapshots,
  selectedDate,
  esBasis,
  esData,
}: Props) {
  const latest = straddleData[straddleData.length - 1];
  const opening = straddleData[0];
  const latestSkew = skewSnapshots[skewSnapshots.length - 1];

  const [pdh, setPdh] = useState<number | null>(null);
  const [pdl, setPdl] = useState<number | null>(null);

  const ticks = useLiveTick(LIVE_SYMBOLS);
  const spxTick = ticks["SPX"] ?? null;
  const esTick = ticks[ES_STREAMER_SYMBOL] ?? null;

  const liveSpx = spxTick?.mid ?? latest?.spx_ref ?? null;

  useEffect(() => {
    const today = new Date().toLocaleDateString("en-CA", {
      timeZone: "America/New_York",
    });

    async function fetchPdhl() {
      if (selectedDate !== today) {
        setPdh(null);
        setPdl(null);
        return;
      }
      try {
        const res = await fetch("/api/pdhl");
        const data = await res.json();
        if (data.pdh) setPdh(data.pdh);
        if (data.pdl) setPdl(data.pdl);
      } catch {}
    }

    fetchPdhl();
  }, [selectedDate]);

  const currentMovePts =
    opening && liveSpx ? Math.abs(liveSpx - opening.spx_ref) : null;

  const realizedMovePct =
    currentMovePts !== null && opening && opening.straddle_mid > 0
      ? ((currentMovePts / opening.straddle_mid) * 100).toFixed(0)
      : null;

  const realizedColor =
    realizedMovePct && parseInt(realizedMovePct) >= 100
      ? "#f87171"
      : realizedMovePct && parseInt(realizedMovePct) >= 70
        ? "#f59e0b"
        : "#9ca3af";

  const esPdh = pdh && esBasis !== null ? pdh + esBasis : null;
  const esPdl = pdl && esBasis !== null ? pdl + esBasis : null;

  return (
    <div className="flex flex-col gap-6">
      {/* Metric strip */}
      <div className="flex items-baseline gap-8">
        <div>
          <span className="text-xs text-gray-400 uppercase tracking-wide mr-2">
            SPX
          </span>
          <span className="text-2xl font-medium text-gray-400">
            {liveSpx?.toFixed(2) ?? "—"}
          </span>
        </div>
        <div>
          <span className="text-xs text-gray-400 uppercase tracking-wide mr-2">
            Current Straddle
          </span>
          <span className="text-2xl font-medium text-gray-400">
            ${latest?.straddle_mid?.toFixed(2) ?? "—"}
          </span>
        </div>
        {opening && (
          <div>
            <span className="text-xs text-gray-400 uppercase tracking-wide mr-2">
              Implied Move
            </span>
            <span className="text-2xl font-medium text-gray-400">
              ${opening.straddle_mid.toFixed(2)}
            </span>
          </div>
        )}
        {currentMovePts !== null && (
          <div>
            <span className="text-xs text-gray-400 uppercase tracking-wide mr-2">
              Realized
            </span>
            <span className="text-2xl font-medium text-gray-400">
              {currentMovePts.toFixed(1)}pts
            </span>
            {realizedMovePct && (
              <span
                className="ml-1.5 text-lg font-medium"
                style={{ color: realizedColor }}
              >
                ({realizedMovePct}%)
              </span>
            )}
          </div>
        )}
        {latestSkew && (
          <div>
            <span className="text-xs text-gray-400 uppercase tracking-wide mr-2">
              IV30
            </span>
            <span className="text-2xl font-medium text-gray-400">
              {(latestSkew.atm_iv * 100).toFixed(1)}
            </span>
          </div>
        )}
      </div>

      {/* SPX chart */}
      <div>
        <div className="text-xs text-[#333] uppercase tracking-widest mb-3">
          SPX
        </div>
        <SpxChart
          data={straddleData}
          selectedDate={selectedDate}
          pdh={pdh}
          pdl={pdl}
          currentPrice={spxTick?.mid ?? null}
        />
      </div>

      <div className="border-t border-[#1a1a1a]" />

      {/* ES chart + converter */}
      <div>
        <div className="text-xs text-[#333] uppercase tracking-widest mb-3">
          ES
        </div>
        <EsChart
          data={esData}
          selectedDate={selectedDate}
          currentPrice={esTick?.mid ?? null}
          pdh={esPdh}
          pdl={esPdl}
        />
        <div className="mt-4">
          <EsSpxConverter initialBasis={esBasis} />
        </div>
      </div>
    </div>
  );
}
