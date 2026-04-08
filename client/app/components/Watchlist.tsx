"use client";

import { WatchlistEntry } from "../api/watchlist/route";
import { TickData, ES_STREAMER_SYMBOL } from "../hooks/useLiveTick";

type Props = {
  entries: WatchlistEntry[];
  ticks: Record<string, TickData>;
};

const EXCLUDE = new Set(["SPX", ES_STREAMER_SYMBOL]);

// Symbol-based category overrides — takes priority over instrumentType
const SYMBOL_CATEGORY_OVERRIDES: Record<string, string> = {
  // Vol ETFs
  UVXY: "Vol", VXX: "Vol", SVXY: "Vol", VIX1D: "Vol", VVIX: "Vol",
  // Commodity ETFs
  GLD: "Metals", SLV: "Metals", IAU: "Metals", PPLT: "Metals",
  USO: "Energy", UNG: "Energy", UCO: "Energy",
  COPX: "Metals", HG: "Metals",
  // Rates ETFs
  TLT: "Rates", IEF: "Rates", SHY: "Rates",
  HYG: "Credit", LQD: "Credit", JNK: "Credit",
};

function getCategory(entry: WatchlistEntry): string {
  // Check symbol override first
  if (SYMBOL_CATEGORY_OVERRIDES[entry.symbol]) {
    return SYMBOL_CATEGORY_OVERRIDES[entry.symbol];
  }

  const { instrumentType, marketSector } = entry;

  if (instrumentType === "Index") return "Vol";
  if (instrumentType === "Cryptocurrency") return "Crypto";
  if (instrumentType === "Equity") return "Equities";

  if (instrumentType === "Future") {
    const sector = marketSector?.toLowerCase() ?? "";
    if (sector.includes("equity") || sector.includes("index")) return "Equity Futs";
    if (sector.includes("energy")) return "Energy";
    if (sector.includes("metal")) return "Metals";
    if (sector.includes("fx") || sector.includes("currenc")) return "FX";
    if (sector.includes("rate") || sector.includes("interest") || sector.includes("fixed")) return "Rates";
    if (sector.includes("agri") || sector.includes("grain")) return "Agri";
    return "Futures";
  }

  return instrumentType;
}

const CATEGORY_ORDER = [
  "Vol",
  "Equity Futs",
  "Equities",
  "Energy",
  "Metals",
  "Credit",
  "Rates",
  "FX",
  "Agri",
  "Futures",
  "Crypto",
];

function groupEntries(entries: WatchlistEntry[]): [string, WatchlistEntry[]][] {
  const groups: Record<string, WatchlistEntry[]> = {};

  for (const entry of entries) {
    if (EXCLUDE.has(entry.symbol) || EXCLUDE.has(entry.streamerSymbol)) continue;
    const cat = getCategory(entry);
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(entry);
  }

  const ordered: [string, WatchlistEntry[]][] = CATEGORY_ORDER
    .filter((cat) => groups[cat])
    .map((cat): [string, WatchlistEntry[]] => [cat, groups[cat]]);

  const unordered: [string, WatchlistEntry[]][] = Object.entries(groups)
    .filter(([cat]) => !CATEGORY_ORDER.includes(cat));

  return [...ordered, ...unordered];
}

function formatPrice(val: number): string {
  if (val >= 10000) return val.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (val >= 100) return val.toFixed(2);
  if (val >= 1) return val.toFixed(3);
  return val.toFixed(5);
}

function formatChange(chg: number): string {
  const abs = Math.abs(chg);
  if (abs >= 100) return chg.toFixed(1);
  if (abs >= 1) return chg.toFixed(2);
  if (abs >= 0.01) return chg.toFixed(3);
  return chg.toFixed(5);
}

export default function Watchlist({ entries, ticks }: Props) {
  const groups = groupEntries(entries);

  if (entries.length === 0) {
    return (
      <div>
        <div className="flex items-center gap-3 mb-3">
          <div className="w-0.5 h-4 bg-[#2a2a2a]" style={{ borderRadius: 0 }} />
          <span className="font-sans text-[11px] text-[#666] uppercase tracking-widest">Watchlist</span>
        </div>
        <div className="font-mono text-[11px] text-[#333] py-4">loading...</div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-3">
        <div className="w-0.5 h-4 bg-[#2a2a2a]" style={{ borderRadius: 0 }} />
        <span className="font-sans text-[11px] text-[#666] uppercase tracking-widest">Watchlist</span>
      </div>

      <div className="grid grid-cols-[1fr_80px_60px_64px] gap-x-3 pb-2 border-b border-[#1a1a1a]">
        <span className="font-sans text-[10px] text-[#444] uppercase tracking-widest">Symbol</span>
        <span className="font-sans text-[10px] text-[#444] uppercase tracking-widest text-right">Last</span>
        <span className="font-sans text-[10px] text-[#444] uppercase tracking-widest text-right">Chg</span>
        <span className="font-sans text-[10px] text-[#444] uppercase tracking-widest text-right">Chg%</span>
      </div>

      <div className="macro-scroll" style={{ height: "250px", overflowY: "auto" }}>
        {groups.map(([category, categoryEntries]) => (
          <div key={category}>
            <div className="font-sans text-[9px] text-[#333] uppercase tracking-widest py-1.5 border-b border-[#111]">
              {category}
            </div>
            {categoryEntries.map((entry) => {
              const tick = ticks[entry.streamerSymbol] ?? null;
              const mid = tick?.mid ?? null;
              const last = tick?.last ?? null;
              const prevClose = tick?.prevClose ?? null;

              // Use Trade last price for indices (mid=0), otherwise use mid
              const displayPrice = (mid === null || mid === 0) ? last : mid;

              const chg =
                displayPrice !== null && prevClose !== null
                  ? displayPrice - prevClose
                  : null;
              const chgPct =
                chg !== null && prevClose !== null && prevClose !== 0
                  ? (chg / prevClose) * 100
                  : null;

              const isPos = chg !== null && chg >= 0;
              const color = chg === null ? "#444" : isPos ? "#4ade80" : "#f87171";

              return (
                <div
                  key={entry.symbol}
                  className="grid grid-cols-[1fr_80px_60px_64px] gap-x-3 py-1.5 border-b border-[#111]"
                >
                  <span className="font-mono text-[11px] text-[#666] truncate">
                    {entry.symbol}
                  </span>
                  <span className="font-mono text-[11px] text-[#9ca3af] text-right">
                    {displayPrice !== null ? formatPrice(displayPrice) : "—"}
                  </span>
                  <span className="font-mono text-[11px] text-right" style={{ color }}>
                    {chg !== null ? (isPos ? "+" : "") + formatChange(chg) : "—"}
                  </span>
                  <span className="font-mono text-[11px] text-right" style={{ color }}>
                    {chgPct !== null ? (isPos ? "+" : "") + chgPct.toFixed(2) + "%" : "—"}
                  </span>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}