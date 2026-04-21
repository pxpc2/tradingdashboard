"use client";

import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { DealerStrikeSnapshot } from "../types";

type DealerState = {
  gex: DealerStrikeSnapshot | null;
  cex: DealerStrikeSnapshot | null;
};

export function useDealerSnapshot(selectedDate: string) {
  const [snapshots, setSnapshots] = useState<DealerState>({
    gex: null,
    cex: null,
  });

  // Initial fetch — latest GEX and CEX snapshot for the selected date
  useEffect(() => {
    let cancelled = false;

    async function load() {
      const { data } = await supabase
        .from("dealer_strike_snapshots")
        .select("*")
        .eq("date", selectedDate)
        .in("metric", ["gex", "cex"])
        .order("created_at", { ascending: false })
        .limit(10); // fetch a few, pick latest per metric

      if (cancelled || !data) return;

      const latest: DealerState = { gex: null, cex: null };
      for (const row of data) {
        if (row.metric === "gex" && !latest.gex) latest.gex = row;
        if (row.metric === "cex" && !latest.cex) latest.cex = row;
        if (latest.gex && latest.cex) break;
      }
      setSnapshots(latest);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [selectedDate]);

  // Realtime — append new snapshots as they arrive
  useEffect(() => {
    const today = new Date().toLocaleDateString("en-CA", {
      timeZone: "America/New_York",
    });

    const channel = supabase
      .channel("dealer_strike_realtime")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "dealer_strike_snapshots",
        },
        (payload) => {
          if (selectedDate !== today) return;
          const row = payload.new as DealerStrikeSnapshot;
          if (row.metric === "gex") {
            setSnapshots((prev) => ({ ...prev, gex: row }));
          } else if (row.metric === "cex") {
            setSnapshots((prev) => ({ ...prev, cex: row }));
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedDate]);

  return snapshots;
}
