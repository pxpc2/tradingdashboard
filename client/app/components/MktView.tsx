"use client";

import { useState, useEffect } from "react";
import SpxChart from "./SpxChart";
import EsChart from "./EsChart";
import { usePharmLevels } from "../hooks/usePharmLevels";
import { TickData } from "../hooks/useLiveTick";
import {
  StraddleSnapshot,
  SkewSnapshot,
  EsSnapshot,
  ChartRange,
} from "../types";
import MacroEvents from "./MacroEvents";
import Watchlist from "./Watchlist";
import { WatchlistEntry } from "../api/watchlist/route";

type Props = {
  straddleData: StraddleSnapshot[];
  skewSnapshots: SkewSnapshot[];
  selectedDate: string;
  esBasis: number | null;
  esData: EsSnapshot[];
  onh: number | null;
  onl: number | null;
  spxTick: TickData | null;
  esTick: TickData | null;
  liveBasis: number | null;
  watchlistEntries: WatchlistEntry[];
  ticks: Record<string, TickData>;
  spxRange: ChartRange;
  esRange: ChartRange;
  onSpxRangeChange: (r: ChartRange) => void;
  onEsRangeChange: (r: ChartRange) => void;
};

const RANGES: ChartRange[] = ["1H", "4H", "1D", "3D", "5D"];

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

function RangeSelector({
  value,
  onChange,
}: {
  value: ChartRange;
  onChange: (r: ChartRange) => void;
}) {
  return (
    <div className="flex items-center ml-auto">
      {RANGES.map((r) => (
        <button
          key={r}
          onClick={() => onChange(r)}
          className={`font-mono text-[11px] px-1.5 py-0.5 uppercase tracking-widest transition-colors hover:cursor-pointer ${
            value === r ? "text-[#888]" : "text-[#444] hover:text-[#666]"
          }`}
        >
          {r}
        </button>
      ))}
    </div>
  );
}

export default function MktView({
  straddleData,
  skewSnapshots,
  selectedDate,
  esBasis,
  esData,
  onh,
  onl,
  spxTick,
  esTick,
  liveBasis,
  watchlistEntries,
  ticks,
  spxRange,
  esRange,
  onSpxRangeChange,
  onEsRangeChange,
}: Props) {
  const latest = straddleData[straddleData.length - 1];
  const opening = straddleData[0];
  const latestSkew = skewSnapshots[skewSnapshots.length - 1];

  const [pdh, setPdh] = useState<number | null>(null);
  const [pdl, setPdl] = useState<number | null>(null);
  const [prevClose, setPrevClose] = useState<number | null>(null);

  const { weeklyLevels, dailyLevels } = usePharmLevels();

  const liveSpx = spxTick?.mid ?? latest?.spx_ref ?? null;
  const liveEs = esTick?.mid ?? esData[esData.length - 1]?.es_ref ?? null;

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
  const esPct = pctChange(liveEs, esTick?.prevClose ?? null);

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      {/* Mobile hero cards — hidden on desktop */}
      <div className="grid grid-cols-2 gap-3 md:hidden">
        <div className="bg-[#111] rounded-sm p-3">
          <div className="font-sans text-[9px] text-[#555] uppercase tracking-widest mb-1">
            SPX
          </div>
          <div className="font-mono font-light text-2xl text-[#9ca3af]">
            {liveSpx?.toFixed(0) ?? "—"}
          </div>
          {spxPct && (
            <div
              className="font-mono text-xs mt-1"
              style={{ color: pctColor(spxPct) }}
            >
              {parseFloat(spxPct) >= 0 ? "+" : ""}
              {spxPct}%
            </div>
          )}
        </div>
        <div className="bg-[#111] rounded-sm p-3">
          <div className="font-sans text-[9px] text-[#555] uppercase tracking-widest mb-1">
            ES
          </div>
          <div className="font-mono font-light text-2xl text-[#9ca3af]">
            {liveEs?.toFixed(0) ?? "—"}
          </div>
          {esPct && (
            <div
              className="font-mono text-xs mt-1"
              style={{ color: pctColor(esPct) }}
            >
              {parseFloat(esPct) >= 0 ? "+" : ""}
              {esPct}%
            </div>
          )}
        </div>
      </div>

      {/* Metric strip */}
      <div className="flex items-baseline gap-4 flex-nowrap overflow-x-auto pb-1 border-b border-[#222]">
        {/* SPX price — desktop only, mobile has hero card */}
        <div className="hidden md:flex items-baseline gap-1.5 shrink-0">
          <span className="font-sans text-[10px] text-[#666] uppercase tracking-widest">
            SPX
          </span>
          <span className="font-mono font-light text-lg text-[#9ca3af]">
            {liveSpx?.toFixed(2) ?? "—"}
          </span>
        </div>
        <div className="hidden md:block w-px h-4 bg-[#1f1f1f] shrink-0" />

        <div className="flex items-baseline gap-1.5 shrink-0">
          <span className="font-sans text-[10px] text-[#666] uppercase tracking-widest">
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
              <span className="font-sans text-[10px] text-[#666] uppercase tracking-widest">
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
              <span className="font-sans text-[10px] text-[#666] uppercase tracking-widest">
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
              <span className="font-sans text-[10px] text-[#666] uppercase tracking-widest">
                IV30
              </span>
              <span className="font-mono font-light text-lg text-[#9ca3af]">
                {(latestSkew.atm_iv * 100).toFixed(1)}
              </span>
            </div>
          </>
        )}
      </div>

      {/* SPX chart — desktop only */}
      <div className="hidden md:block">
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
          <RangeSelector value={spxRange} onChange={onSpxRangeChange} />
        </div>
        <SpxChart
          data={straddleData}
          selectedDate={selectedDate}
          pdh={pdh}
          pdl={pdl}
          currentPrice={spxTick?.mid ?? null}
          range={spxRange}
        />
      </div>

      <div className="hidden md:block border-t border-[#222]" />

      {/* ES chart — desktop only */}
      <div className="hidden md:block">
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
          <RangeSelector value={esRange} onChange={onEsRangeChange} />
        </div>
        <EsChart
          data={esData}
          selectedDate={selectedDate}
          currentPrice={esTick?.mid ?? null}
          weeklyLevels={weeklyLevels}
          dailyLevels={dailyLevels}
          onh={onh}
          onl={onl}
          range={esRange}
        />
      </div>

      <div className="border-t border-[#222]" />

      {/* Bottom section — stacked on mobile, two-column on desktop */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8">
        <div className="md:col-span-2">
          <MacroEvents selectedDate={selectedDate} />
        </div>
        <Watchlist entries={watchlistEntries} ticks={ticks} />
      </div>
    </div>
  );
}
