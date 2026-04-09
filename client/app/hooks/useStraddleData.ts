"use client";

import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { StraddleSnapshot } from "../types";

function getStartDate(selectedDate: string, days: number): string {
  const d = new Date(`${selectedDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - (days - 1));
  return d.toISOString().slice(0, 10);
}

export function useStraddleData(
  selectedDate: string,
  initialData: StraddleSnapshot[] = [],
  days: number = 1,
) {
  const [straddleData, setStraddleData] =
    useState<StraddleSnapshot[]>(initialData);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const startDate = getStartDate(selectedDate, days);
      const { data } = await supabase
        .from("straddle_snapshots")
        .select("*")
        .gte("created_at", `${startDate}T00:00:00`)
        .lt("created_at", `${selectedDate}T23:59:59`)
        .order("created_at", { ascending: true });
      if (!cancelled && data) setStraddleData(data);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [selectedDate, days]);

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

  const esBasis: number | null =
    straddleData.find((s) => s.es_basis != null)?.es_basis ?? null;

  return { straddleData, esBasis };
}
