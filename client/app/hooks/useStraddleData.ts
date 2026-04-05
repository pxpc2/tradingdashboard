"use client";

import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { StraddleSnapshot } from "../types";

export function useStraddleData(
  selectedDate: string,
  initialData: StraddleSnapshot[] = [],
) {
  const [straddleData, setStraddleData] =
    useState<StraddleSnapshot[]>(initialData);

  // Fetch on date change
  useEffect(() => {
    let cancelled = false;
    async function load() {
      const { data } = await supabase
        .from("straddle_snapshots")
        .select("*")
        .gte("created_at", `${selectedDate}T00:00:00`)
        .lt("created_at", `${selectedDate}T23:59:59`)
        .order("created_at", { ascending: true });
      if (!cancelled && data) setStraddleData(data);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [selectedDate]);

  // Realtime subscription — only appends when viewing today
  useEffect(() => {
    const today = new Date().toLocaleDateString("en-CA", {
      timeZone: "America/New_York",
    });
    const channel = supabase
      .channel("straddle_realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "straddle_snapshots" },
        (payload) => {
          if (selectedDate === today)
            setStraddleData((prev) => [
              ...prev,
              payload.new as StraddleSnapshot,
            ]);
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedDate]);

  // es_basis lives on the first snapshot of the day (open cycle only)
  const esBasis: number | null = straddleData[0]?.es_basis ?? null;

  return { straddleData, esBasis };
}
