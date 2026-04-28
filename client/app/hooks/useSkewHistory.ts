"use client";

import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { fetchAll } from "../lib/supabase-paginate";
import { SkewSnapshot } from "../types";

// Skew calculations were fixed on April 1, 2026 — only use data from April 2 onwards
const SKEW_START_DATE = "2026-04-02";

export function useSkewHistory() {
  const [skewHistory, setSkewHistory] = useState<SkewSnapshot[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch all historical skew data (paginated to bypass 15k row cap)
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setIsLoading(true);
      const data = await fetchAll<SkewSnapshot>((from, to) =>
        supabase
          .from("skew_snapshots")
          .select("*")
          .gte("created_at", `${SKEW_START_DATE}T00:00:00`)
          .order("created_at", { ascending: true })
          .range(from, to),
      );
      if (!cancelled) {
        setSkewHistory(data);
        setIsLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  // Realtime subscription — append new skew snapshots
  useEffect(() => {
    const channel = supabase
      .channel("skew_history_realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "skew_snapshots" },
        (payload) => {
          setSkewHistory((prev) => [...prev, payload.new as SkewSnapshot]);
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const latestSkew = skewHistory[skewHistory.length - 1] ?? null;
  
  // Calculate average skew
  const avgSkew =
    skewHistory.length > 0
      ? skewHistory.reduce((sum, s) => sum + s.skew, 0) / skewHistory.length
      : null;

  return { skewHistory, latestSkew, avgSkew, isLoading };
}
