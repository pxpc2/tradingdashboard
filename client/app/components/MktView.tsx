"use client";

import { useState, useEffect } from "react";
import SpxChart from "./SpxChart";
import EsChart from "./EsChart";
import EsSpxConverter from "./Converter";
import { useLiveTick, ES_STREAMER_SYMBOL } from "../hooks/useLiveTick";
import { usePharmLevels } from "../hooks/usePharmLevels";
import { StraddleSnapshot, SkewSnapshot, EsSnapshot } from "../types";

type Props = {
  straddleData: StraddleSnapshot[];
  skewSnapshots: SkewSnapshot[];
  selectedDate: string;
  esBasis: number | null;
  esData: EsSnapshot[];
};

const LIVE_SYMBOLS = ["SPX", ES_STREAMER_SYMBOL];

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

function isEsOpen(): boolean {
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
  if (day === "Sat") return false;
  if (day === "Sun" && time < "18:00:00") return false;
  if (!["Sat", "Sun"].includes(day) && time >= "17:00:00" && time < "18:00:00")
    return false;
  return true;
}

function isToday(selectedDate: string): boolean {
  return (
    selectedDate ===
    new Date().toLocaleDateString("en-CA", {
      timeZone: "America/New_York",
    })
  );
}

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

  const { weeklyLevels, dailyLevels } = usePharmLevels();

  const liveSpx = spxTick?.mid ?? latest?.spx_ref ?? null;

  // Compute ONH/ONL from esData — only during RTH on today
  const { onh, onl } = (() => {
    if (!isToday(selectedDate) || !isSpxOpen()) return { onh: null, onl: null };

    const rthOpen = new Date(`${selectedDate}T14:30:00Z`).getTime();
    const prevRthClose = rthOpen - 17.5 * 60 * 60 * 1000;

    const overnightPoints = esData.filter((s) => {
      const t = new Date(s.created_at).getTime();
      return t >= prevRthClose && t < rthOpen;
    });

    if (overnightPoints.length === 0) return { onh: null, onl: null };

    return {
      onh: Math.max(...overnightPoints.map((s) => s.high ?? s.es_ref)),
      onl: Math.min(...overnightPoints.map((s) => s.low ?? s.es_ref)),
    };
  })();

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

  const spxOpen = isSpxOpen();
  const esOpen = isEsOpen();

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
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xs text-gray-400 uppercase tracking-widest">
            SPX
          </span>
          <div
            className="w-1.5 h-1.5 rounded-full"
            style={{ backgroundColor: spxOpen ? "#4ade80" : "#333333" }}
          />
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

      {/* ES chart */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xs text-gray-400 uppercase tracking-widest">
            ES
          </span>
          <div
            className="w-1.5 h-1.5 rounded-full"
            style={{ backgroundColor: esOpen ? "#4ade80" : "#333333" }}
          />
        </div>
        <EsChart
          data={esData}
          selectedDate={selectedDate}
          currentPrice={esTick?.mid ?? null}
          weeklyLevels={weeklyLevels}
          dailyLevels={dailyLevels}
          onh={onh}
          onl={onl}
        />
        <div className="mt-4">
          <EsSpxConverter initialBasis={esBasis} />
        </div>
      </div>
    </div>
  );
}
