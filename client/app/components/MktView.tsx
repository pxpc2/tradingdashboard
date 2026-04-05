"use client";

import { useState, useEffect } from "react";
import SpxChart from "./SpxChart";
import EsSpxConverter from "./Converter";
import { StraddleSnapshot, SkewSnapshot } from "../types";

type Props = {
  straddleData: StraddleSnapshot[];
  skewSnapshots: SkewSnapshot[];
  selectedDate: string;
  esBasis: number | null;
};

function EsChartPlaceholder() {
  return (
    <div className="w-full h-[400px] rounded-sm bg-[#111111] flex items-center justify-center">
      <span className="text-xs text-[#2a2a2a] uppercase tracking-widest">
        ES chart — em breve
      </span>
    </div>
  );
}

export default function MktView({
  straddleData,
  skewSnapshots,
  selectedDate,
  esBasis,
}: Props) {
  const latest = straddleData[straddleData.length - 1];
  const opening = straddleData[0];
  const latestSkew = skewSnapshots[skewSnapshots.length - 1];

  const [pdh, setPdh] = useState<number | null>(null);
  const [pdl, setPdl] = useState<number | null>(null);

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

  const realizedMovePct =
    opening && latest && opening.straddle_mid > 0
      ? (
          (Math.abs(latest.spx_ref - opening.spx_ref) / opening.straddle_mid) *
          100
        ).toFixed(0)
      : null;

  return (
    <div className="flex flex-col gap-6">
      {/* Metric strip */}
      <div className="flex items-baseline gap-8">
        <div>
          <span className="text-xs text-gray-400 uppercase tracking-wide mr-2">
            SPX
          </span>
          <span className="text-2xl font-medium text-gray-400">
            {latest?.spx_ref?.toFixed(2) ?? "—"}
          </span>
        </div>
        <div>
          <span className="text-xs text-gray-400 uppercase tracking-wide mr-2">
            Straddle
          </span>
          <span className="text-2xl font-medium text-gray-400">
            ${latest?.straddle_mid?.toFixed(2) ?? "—"}
          </span>
        </div>
        {realizedMovePct && (
          <div>
            <span className="text-xs text-gray-400 uppercase tracking-wide mr-2">
              Realized
            </span>
            <span
              className="text-2xl font-medium"
              style={{
                color:
                  parseInt(realizedMovePct) >= 80
                    ? "#f87171"
                    : parseInt(realizedMovePct) >= 50
                      ? "#f59e0b"
                      : "#9ca3af",
              }}
            >
              {realizedMovePct}%
            </span>
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
        />
      </div>

      <div className="border-t border-[#1a1a1a]" />

      {/* ES chart + converter */}
      <div>
        <div className="text-xs text-[#333] uppercase tracking-widest mb-3">
          ES
        </div>
        <EsChartPlaceholder />
        <div className="mt-4">
          <EsSpxConverter initialBasis={esBasis} />
        </div>
      </div>
    </div>
  );
}
