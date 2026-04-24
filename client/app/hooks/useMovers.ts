"use client";

import { useEffect, useState } from "react";
import type { MoverItem } from "../api/sp100-movers/route";

type MoversData = {
  gainers: MoverItem[];
  losers: MoverItem[];
};

let cachedPromise: Promise<MoversData> | null = null;

function fetchMovers(): Promise<MoversData> {
  if (!cachedPromise) {
    cachedPromise = fetch("/api/sp100-movers")
      .then((r) => r.json())
      .then((j) => ({ gainers: j.gainers ?? [], losers: j.losers ?? [] }))
      .catch(() => ({ gainers: [], losers: [] }));
    setTimeout(() => {
      cachedPromise = null;
    }, 60_000);
  }
  return cachedPromise;
}

export function useMovers(kind: "gainers" | "losers"): {
  movers: MoverItem[];
  loading: boolean;
} {
  const [movers, setMovers] = useState<MoverItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const data = await fetchMovers();
        if (!cancelled) {
          setMovers(kind === "gainers" ? data.gainers : data.losers);
        }
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
  }, [kind]);

  return { movers, loading };
}
