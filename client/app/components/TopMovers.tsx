"use client";

import { useMovers } from "../hooks/useMovers";
import { THEME } from "../lib/theme";

type Props = {
  kind: "gainers" | "losers";
};

export default function TopMovers({ kind }: Props) {
  const { movers, loading } = useMovers(kind);

  const title = kind === "gainers" ? "Top movers ↑" : "Bottom movers ↓";
  const posColor = kind === "gainers" ? THEME.up : THEME.down;

  return (
    <div className="bg-page border border-border-2 flex flex-col">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border-2 bg-panel">
        <span className="font-sans text-xs uppercase tracking-[0.05em] text-text-3">
          {title}
        </span>
        <span className="font-mono text-[11px] text-text-5">
          TOP100 MKTCAP SP500
        </span>
      </div>

      <div className="flex-1 px-3 py-1">
        {loading && movers.length === 0 ? (
          <div className="flex items-center justify-center h-24 font-sans text-[10px] uppercase tracking-wide text-text-5">
            Loading…
          </div>
        ) : movers.length === 0 ? (
          <div className="flex items-center justify-center h-24 font-sans text-[10px] uppercase tracking-wide text-text-5">
            No data
          </div>
        ) : (
          <div>
            {movers.map((m, i) => (
              <div
                key={m.symbol}
                className={`flex items-center gap-2 font-mono text-[10px] py-1 ${
                  i < movers.length - 1 ? "border-b border-border-2/50" : ""
                }`}
              >
                <span className="flex-1 shrink-0" style={{ color: THEME.text }}>
                  {m.symbol}
                </span>
                <span
                  className="w-12 text-right shrink-0"
                  style={{ color: THEME.text2 }}
                >
                  {m.price.toFixed(2)}
                </span>
                <span
                  className="w-12 text-right shrink-0"
                  style={{ color: posColor }}
                >
                  {m.changePct >= 0 ? "+" : ""}
                  {m.changePct.toFixed(2)}%
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
