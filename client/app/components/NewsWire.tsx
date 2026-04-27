"use client";

import { useEffect, useRef, useState } from "react";
import { useMarketNews } from "../hooks/useMarketNews";
import { THEME } from "../lib/theme";
import type { NewsItem } from "../api/market-news/route";

type Props = {
  height?: number;
};

function categoryColor(category: NewsItem["category"]): string {
  if (category === "macro") return THEME.amber;
  return THEME.indigo;
}

export default function NewsWire({ height = 400 }: Props) {
  const { items, loading } = useMarketNews();

  const seenUrlsRef = useRef<Set<string>>(new Set());
  const isFirstLoadRef = useRef(true);
  const [newUrls, setNewUrls] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (items.length === 0) return;

    if (isFirstLoadRef.current) {
      seenUrlsRef.current = new Set(items.map((i) => i.url));
      isFirstLoadRef.current = false;
      return;
    }

    const incomingNew: string[] = [];
    for (const item of items) {
      if (!seenUrlsRef.current.has(item.url)) {
        incomingNew.push(item.url);
        seenUrlsRef.current.add(item.url);
      }
    }

    if (incomingNew.length === 0) return;

    queueMicrotask(() => {
      setNewUrls((prev) => {
        const next = new Set(prev);
        incomingNew.forEach((u) => next.add(u));
        return next;
      });
    });

    const timer = setTimeout(() => {
      setNewUrls((prev) => {
        const next = new Set(prev);
        incomingNew.forEach((u) => next.delete(u));
        return next;
      });
    }, 2200);

    return () => clearTimeout(timer);
  }, [items]);

  return (
    <div
      className="bg-page border border-border-2 flex flex-col"
      style={{ height }}
    >
      <div className="flex items-center justify-between px-3 py-2 border-b border-border-2 shrink-0 bg-panel">
        <span className="font-sans text-xs uppercase tracking-[0.05em] text-text-3">
          General News
        </span>
      </div>

      <div className="flex-1 overflow-y-auto news-scroll">
        {loading && items.length === 0 ? (
          <div className="py-8 text-center">
            <span className="font-sans text-[10px] uppercase tracking-wide text-text-5">
              Loading…
            </span>
          </div>
        ) : items.length === 0 ? (
          <div className="py-8 text-center">
            <span className="font-sans text-[10px] uppercase tracking-wide text-text-5">
              No news
            </span>
          </div>
        ) : (
          <div className="py-1">
            {items.map((n, i) => {
              const isNew = newUrls.has(n.url);
              return (
                <a
                  key={n.url}
                  href={n.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`relative flex items-center gap-2 px-3 py-1 text-[11px] group ${
                    i < items.length - 1 ? "border-b border-border-2/50" : ""
                  } ${isNew ? "news-row-new" : ""}`}
                >
                  <span
                    className="font-mono text-[10px] w-10 shrink-0"
                    style={{ color: THEME.text4 }}
                  >
                    {n.time}
                  </span>
                  <span
                    className="font-mono text-[10px] w-10 shrink-0"
                    style={{ color: THEME.indigo }}
                  >
                    {n.source}
                  </span>
                  <span
                    className="shrink-0 text-[8px]"
                    style={{ color: categoryColor(n.category) }}
                    aria-label={n.category}
                  >
                    ■
                  </span>
                  <span
                    className="flex-1 font-sans truncate group-hover:text-text"
                    style={{ color: THEME.text2 }}
                    title={n.title}
                  >
                    {n.title}
                    {n.symbol && (
                      <span
                        className="ml-1 font-mono text-[10px]"
                        style={{ color: THEME.text4 }}
                      >
                        · {n.symbol}
                      </span>
                    )}
                  </span>
                </a>
              );
            })}
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
        .news-scroll {
          scrollbar-width: thin;
          scrollbar-color: var(--color-border-2) transparent;
        }
      `}</style>
    </div>
  );
}
