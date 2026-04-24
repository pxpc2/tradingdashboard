"use client";

import { useEffect, useState } from "react";
import type { NewsItem } from "../api/market-news/route";

export function useMarketNews(): { items: NewsItem[]; loading: boolean } {
  const [items, setItems] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/market-news");
        const json = await res.json();
        if (!cancelled) setItems(json.items ?? []);
      } catch {
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    const t = setInterval(load, 60 * 1000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  return { items, loading };
}
