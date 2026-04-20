"use client";

import { useMemo } from "react";
import { useWatchlist } from "../hooks/useWatchlist";
import { useLiveTick, ES_STREAMER_SYMBOL } from "../hooks/useLiveTick";
import { WatchlistEntry } from "../api/watchlist/route";
import { THEME } from "../lib/theme";

const SPX_ENTRY: WatchlistEntry = {
  symbol: "SPX",
  streamerSymbol: "SPX",
  instrumentType: "Index",
  marketSector: null,
};

const ES_ENTRY: WatchlistEntry = {
  symbol: "ES",
  streamerSymbol: ES_STREAMER_SYMBOL,
  instrumentType: "Future",
  marketSector: null,
};

function isCategoryOpen(instrumentType: string): boolean {
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
  const isWeekday = !["Sat", "Sun"].includes(day);
  const rthOpen = isWeekday && time >= "09:30:00" && time < "16:00:00";
  const globexOpen =
    day !== "Sat" &&
    !(day === "Sun" && time < "18:00:00") &&
    !(isWeekday && time >= "17:00:00" && time < "18:00:00");

  if (instrumentType === "Future") return globexOpen;
  if (instrumentType === "Cryptocurrency") return true;
  return rthOpen;
}

function formatPrice(val: number): string {
  if (val >= 10000)
    return val.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (val >= 100) return val.toFixed(1);
  if (val >= 1) return val.toFixed(2);
  return val.toFixed(3);
}

function pctChange(
  current: number | null,
  prevClose: number | null,
): string | null {
  if (!current || !prevClose || prevClose === 0) return null;
  return (((current - prevClose) / prevClose) * 100).toFixed(2);
}

export default function SecondaryTicker() {
  const { entries } = useWatchlist();

  const allEntries = useMemo(
    () => [
      SPX_ENTRY,
      ES_ENTRY,
      ...entries.filter(
        (e) => e.symbol !== "SPX" && e.streamerSymbol !== ES_STREAMER_SYMBOL,
      ),
    ],
    [entries],
  );

  const symbols = useMemo(
    () => allEntries.map((e) => e.streamerSymbol),
    [allEntries],
  );

  const ticks = useLiveTick(symbols);

  return (
    <div
      className="bg-panel border-b border-border"
      aria-label="Watchlist"
    >
      <div className="max-w-7xl mx-auto h-6 overflow-x-auto secondary-ticker-scroll">
        <div className="flex items-center gap-4 px-4 h-full w-max">
          {allEntries.map((e) => {
            const t = ticks[e.streamerSymbol] ?? null;
            const mid = t?.mid ?? null;
            const last = t?.last ?? null;
            const displayPrice = mid === null || mid === 0 ? last : mid;
            const pct = pctChange(displayPrice, t?.prevClose ?? null);
            const isOpen = isCategoryOpen(e.instrumentType);

            const symbolColor = isOpen ? THEME.text3 : THEME.text5;
            const priceColor = isOpen ? THEME.text2 : THEME.text5;
            const pctColor =
              !isOpen
                ? THEME.text5
                : pct === null
                  ? THEME.text4
                  : parseFloat(pct) >= 0
                    ? THEME.up
                    : THEME.down;

            return (
              <div
                key={e.streamerSymbol}
                className="flex items-center gap-1.5 text-[10px] whitespace-nowrap shrink-0"
                title={e.streamerSymbol}
              >
                <span
                  className="font-sans uppercase tracking-wide"
                  style={{ color: symbolColor }}
                >
                  {e.symbol}
                </span>
                <span className="font-mono" style={{ color: priceColor }}>
                  {displayPrice !== null ? formatPrice(displayPrice) : "—"}
                </span>
                {pct !== null && (
                  <span className="font-mono" style={{ color: pctColor }}>
                    {parseFloat(pct) >= 0 ? "+" : ""}
                    {pct}%
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <style>{`
        .secondary-ticker-scroll::-webkit-scrollbar {
          height: 3px;
        }
        .secondary-ticker-scroll::-webkit-scrollbar-track {
          background: transparent;
        }
        .secondary-ticker-scroll::-webkit-scrollbar-thumb {
          background: var(--color-border-2);
          border-radius: 0;
        }
        .secondary-ticker-scroll::-webkit-scrollbar-thumb:hover {
          background: var(--color-text-5);
        }
        .secondary-ticker-scroll {
          scrollbar-width: thin;
          scrollbar-color: var(--color-border-2) transparent;
        }
      `}</style>
    </div>
  );
}
