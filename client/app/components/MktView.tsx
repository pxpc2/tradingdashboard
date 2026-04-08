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
  onh: number | null;
  onl: number | null;
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

function pctChange(
  current: number | null,
  prevClose: number | null,
): string | null {
  if (!current || !prevClose || prevClose === 0) return null;
  return (((current - prevClose) / prevClose) * 100).toFixed(2);
}

function pctColor(pct: string | null): string {
  if (!pct) return "#666";
  return parseFloat(pct) >= 0 ? "#4ade80" : "#f87171";
}

export default function MktView({
  straddleData,
  skewSnapshots,
  selectedDate,
  esBasis,
  esData,
  onh,
  onl,
}: Props) {
  const latest = straddleData[straddleData.length - 1];
  const opening = straddleData[0];
  const latestSkew = skewSnapshots[skewSnapshots.length - 1];

  const [pdh, setPdh] = useState<number | null>(null);
  const [pdl, setPdl] = useState<number | null>(null);
  const [prevClose, setPrevClose] = useState<number | null>(null);

  const ticks = useLiveTick(LIVE_SYMBOLS);
  const spxTick = ticks["SPX"] ?? null;
  const esTick = ticks[ES_STREAMER_SYMBOL] ?? null;

  const { weeklyLevels, dailyLevels } = usePharmLevels();

  const liveSpx = spxTick?.mid ?? latest?.spx_ref ?? null;
  const liveEs = esTick?.mid ?? esData[esData.length - 1]?.es_ref ?? null;

  const liveBasis =
    spxTick && esTick
      ? parseFloat((esTick.mid - spxTick.mid).toFixed(2))
      : esBasis;

  useEffect(() => {
    const today = new Date().toLocaleDateString("en-CA", {
      timeZone: "America/New_York",
    });
    async function fetchPdhl() {
      if (selectedDate !== today) {
        setPdh(null);
        setPdl(null);
        setPrevClose(null);
        return;
      }
      try {
        const res = await fetch("/api/pdhl");
        const data = await res.json();
        if (data.pdh) setPdh(data.pdh);
        if (data.pdl) setPdl(data.pdl);
        if (data.close) setPrevClose(data.close);
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

  const spxPct = pctChange(liveSpx, prevClose);
  const esPrevClose =
    prevClose && esBasis !== null ? prevClose + esBasis : null;
  const esPct = pctChange(liveEs, esPrevClose);

  return (
    <div className="flex flex-col gap-6">
      {/* Metric strip */}
      <div className="flex items-baseline gap-6 flex-nowrap overflow-x-auto pb-1 border-b border-[#222]">
        <div className="flex items-baseline gap-1.5 shrink-0">
          <span className="font-sans text-[11px] text-[#666] uppercase tracking-widest">
            SPX
          </span>
          <span className="font-mono font-light text-lg text-[#9ca3af]">
            {liveSpx?.toFixed(2) ?? "—"}
          </span>
          {spxPct && (
            <span
              className="font-mono text-xs"
              style={{ color: pctColor(spxPct) }}
            >
              {parseFloat(spxPct) >= 0 ? "+" : ""}
              {spxPct}%
            </span>
          )}
        </div>

        <div className="w-px h-4 bg-[#1f1f1f] shrink-0" />

        <div className="flex items-baseline gap-1.5 shrink-0">
          <span className="font-sans text-[11px] text-[#666] uppercase tracking-widest">
            Straddle
          </span>
          <span className="font-mono font-light text-lg text-[#9ca3af]">
            ${latest?.straddle_mid?.toFixed(2) ?? "—"}
          </span>
        </div>

        {opening && (
          <>
            <div className="w-px h-4 bg-[#1f1f1f] shrink-0" />
            <div className="flex items-baseline gap-1.5 shrink-0">
              <span className="font-sans text-[11px] text-[#666] uppercase tracking-widest">
                Implied
              </span>
              <span className="font-mono font-light text-lg text-[#9ca3af]">
                ${opening.straddle_mid.toFixed(2)}
              </span>
            </div>
          </>
        )}

        {currentMovePts !== null && (
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
                {currentMovePts.toFixed(1)}pts
              </span>
              {realizedMovePct && (
                <span
                  className="font-mono text-xs"
                  style={{ color: realizedColor }}
                >
                  ({realizedMovePct}%)
                </span>
              )}
            </div>
          </>
        )}

        {latestSkew && (
          <>
            <div className="w-px h-4 bg-[#1f1f1f] shrink-0" />
            <div className="flex items-baseline gap-1.5 shrink-0">
              <span className="font-sans text-[11px] text-[#666] uppercase tracking-widest">
                IV30
              </span>
              <span className="font-mono font-light text-lg text-[#9ca3af]">
                {(latestSkew.atm_iv * 100).toFixed(1)}
              </span>
            </div>
          </>
        )}
      </div>

      {/* SPX chart */}
      <div>
        <div className="flex items-center gap-3 mb-3">
          <div
            className="w-0.5 h-4"
            style={{
              backgroundColor: spxOpen ? "#4ade80" : "#2a2a2a",
              borderRadius: 0,
            }}
          />
          <span className="font-sans text-[11px] text-[#666] uppercase tracking-widest">
            SPX
          </span>
          {liveSpx && (
            <span className="font-mono font-light text-sm text-[#666]">
              {liveSpx.toFixed(2)}
            </span>
          )}
          {spxPct && (
            <span
              className="font-mono text-xs"
              style={{ color: pctColor(spxPct) }}
            >
              {parseFloat(spxPct) >= 0 ? "+" : ""}
              {spxPct}%
            </span>
          )}
        </div>
        <SpxChart
          data={straddleData}
          selectedDate={selectedDate}
          pdh={pdh}
          pdl={pdl}
          currentPrice={spxTick?.mid ?? null}
        />
      </div>

      <div className="border-t border-[#222]" />

      {/* ES chart */}
      <div>
        <div className="flex items-center gap-3 mb-3">
          <div
            className="w-0.5 h-4"
            style={{
              backgroundColor: esOpen ? "#4ade80" : "#2a2a2a",
              borderRadius: 0,
            }}
          />
          <span className="font-sans text-[11px] text-[#666] uppercase tracking-widest">
            ES
          </span>
          {liveEs && (
            <span className="font-mono font-light text-sm text-[#666]">
              {liveEs.toFixed(2)}
            </span>
          )}
          {esPct && (
            <span
              className="font-mono text-xs"
              style={{ color: pctColor(esPct) }}
            >
              {parseFloat(esPct) >= 0 ? "+" : ""}
              {esPct}%
            </span>
          )}
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
          <EsSpxConverter initialBasis={liveBasis} />
        </div>
      </div>
    </div>
  );
}
