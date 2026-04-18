"use client";

import { WatchlistEntry } from "../api/watchlist/route";
import { TickData, ES_STREAMER_SYMBOL } from "../hooks/useLiveTick";

type Props = {
  entries: WatchlistEntry[];
  ticks: Record<string, TickData>;
};

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

// Blue for up, amber for down
function pctColor(pct: string): string {
  return parseFloat(pct) >= 0 ? "#60a5fa" : "#E4D00A";
}

function TickerItem({
  entry,
  ticks,
}: {
  entry: WatchlistEntry;
  ticks: Record<string, TickData>;
}) {
  const tick = ticks[entry.streamerSymbol] ?? null;
  const mid = tick?.mid ?? null;
  const last = tick?.last ?? null;
  const displayPrice = mid === null || mid === 0 ? last : mid;
  const pct = pctChange(displayPrice, tick?.prevClose ?? null);
  const isOpen = isCategoryOpen(entry.instrumentType);
  const borderColor = isOpen ? "#4ade80" : "#f87171";

  return (
    <div
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
      {pct && (
        <span
          className="font-mono"
          style={{ color: isOpen ? pctColor(pct) : "#444" }}
        >
          {parseFloat(pct) >= 0 ? "+" : ""}
          {pct}%
        </span>
      )}
    </div>
  );
}

export default function WatchlistStrip({ entries, ticks }: Props) {
  const allEntries = [
    SPX_ENTRY,
    ES_ENTRY,
    ...entries.filter(
      (e) => e.symbol !== "SPX" && e.streamerSymbol !== ES_STREAMER_SYMBOL,
    ),
  ];

  return (
    <div
      className="overflow-hidden py-1.5 text-xs"
      style={{
        maskImage:
          "linear-gradient(to right, transparent, black 4%, black 96%, transparent)",
      }}
    >
      <style>{`
        @keyframes ticker {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .ticker-track {
          display: flex;
          gap: 1.5rem;
          width: max-content;
          animation: ticker 120s linear infinite;
        }
        .ticker-track:hover {
          animation-play-state: paused;
        }
      `}</style>
      <div className="ticker-track">
        {[...allEntries, ...allEntries].map((entry, i) => (
          <TickerItem
            key={`${entry.symbol}-${i}`}
            entry={entry}
            ticks={ticks}
          />
        ))}
      </div>
    </div>
  );
}
