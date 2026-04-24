"use client";

import { useMarketNews } from "../hooks/useMarketNews";
import { THEME } from "../lib/theme";
import type { NewsItem } from "../api/market-news/route";

function categoryColor(category: NewsItem["category"]): string {
  if (category === "macro") return THEME.amber;
  return THEME.indigo;
}

export default function NewsWire() {
  const { items, loading } = useMarketNews();

  return (
    <div className="bg-page border border-border-2 flex flex-col">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border-2">
        <span className="font-sans text-xs uppercase tracking-[0.05em] text-text-4">
          News · market wire
        </span>
        <span className="font-mono text-[9px] text-text-5">24H · FMP</span>
      </div>

      <div className="flex-1 px-3 py-1 max-h-[320px] overflow-y-auto news-scroll">
        {loading && items.length === 0 ? (
          <div className="flex items-center justify-center h-24 font-sans text-[10px] uppercase tracking-wide text-text-5">
            Loading…
          </div>
        ) : items.length === 0 ? (
          <div className="flex items-center justify-center h-24 font-sans text-[10px] uppercase tracking-wide text-text-5">
            No news
          </div>
        ) : (
          <div>
            {items.map((n, i) => (
              <a
                key={`${n.time}-${n.title}-${i}`}
                href={n.url}
                target="_blank"
                rel="noopener noreferrer"
                className={`flex items-start gap-2 py-1.5 group ${
                  i < items.length - 1 ? "border-b border-border-2/50" : ""
                }`}
              >
                <span
                  className="font-mono text-[9px] w-10 shrink-0 mt-px"
                  style={{ color: THEME.text5 }}
                >
                  {n.time}
                </span>
                <span
                  className="font-mono text-[9px] w-10 shrink-0 mt-px"
                  style={{ color: THEME.indigo }}
                >
                  {n.source}
                </span>
                <span
                  className="w-1 h-1 rounded-full mt-1.5 shrink-0"
                  style={{ background: categoryColor(n.category) }}
                />
                <span
                  className="flex-1 text-[10px] leading-snug group-hover:text-text"
                  style={{ color: THEME.text2 }}
                  title={n.title}
                >
                  {n.title}
                  {n.symbol && (
                    <span
                      className="ml-1 font-mono text-[9px]"
                      style={{ color: THEME.text4 }}
                    >
                      · {n.symbol}
                    </span>
                  )}
                </span>
              </a>
            ))}
          </div>
        )}
      </div>

      <style>{`
        .news-scroll::-webkit-scrollbar { width: 3px; }
        .news-scroll::-webkit-scrollbar-track { background: transparent; }
        .news-scroll::-webkit-scrollbar-thumb {
          background: var(--color-border-2);
          border-radius: 0;
        }
      `}</style>
    </div>
  );
}
