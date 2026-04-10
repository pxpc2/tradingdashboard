"use client";

import { WatchlistEntry } from "../api/watchlist/route";
import { TickData, ES_STREAMER_SYMBOL } from "../hooks/useLiveTick";

type Props = {
  entries: WatchlistEntry[];
  ticks: Record<string, TickData>;
};

const EXCLUDE = new Set(["SPX", ES_STREAMER_SYMBOL]);

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
  if (val >= 10000) return val.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (val >= 100) return val.toFixed(1);
  if (val >= 1) return val.toFixed(2);
  return val.toFixed(3);
}

export default function WatchlistStrip({ entries, ticks }: Props) {
  const filtered = entries.filter(
    (e) => !EXCLUDE.has(e.symbol) && !EXCLUDE.has(e.streamerSymbol),
  );

  if (filtered.length === 0) return null;

  return (
    <div className="flex gap-4 overflow-x-auto py-1.5 text-xs">
      {filtered.map((entry) => {
        const tick = ticks[entry.streamerSymbol] ?? null;
        const mid = tick?.mid ?? null;
        const last = tick?.last ?? null;
        const displayPrice = mid === null || mid === 0 ? last : mid;
        const isOpen = isCategoryOpen(entry.instrumentType);
        const borderColor = isOpen ? "#4ade80" : "#f87171";

        return (
          <div
            key={entry.symbol}
            className="flex items-center gap-2 shrink-0 pl-2"
            style={{ borderLeft: `2px solid ${borderColor}` }}
          >
            <span style={{ color: isOpen ? "#666" : "#444" }}>{entry.symbol}</span>
            <span
              className="font-mono"
              style={{ color: isOpen ? "#9ca3af" : "#444" }}
            >
              {displayPrice !== null ? formatPrice(displayPrice) : "—"}
            </span>
          </div>
        );
      })}
    </div>
  );
}
