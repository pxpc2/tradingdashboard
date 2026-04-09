"use client";

import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { EsSnapshot } from "../types";

export function useEsData(selectedDate: string, days: number = 1) {
  const [esData, setEsData] = useState<EsSnapshot[]>([]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const date = new Date(`${selectedDate}T00:00:00Z`);

      // Start far enough back to capture overnight sessions
      const startDay = new Date(date);
      startDay.setUTCDate(startDay.getUTCDate() - days);

      const nextDay = new Date(date);
      nextDay.setUTCDate(nextDay.getUTCDate() + 1);

      const from = `${startDay.toISOString().slice(0, 10)}T06:00:00Z`;
      const to = `${nextDay.toISOString().slice(0, 10)}T06:00:00Z`;

      const { data } = await supabase
        .from("es_snapshots")
        .select("*")
        .gte("created_at", from)
        .lt("created_at", to)
        .order("created_at", { ascending: true });
      if (!cancelled) setEsData(data ?? []);
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
      .channel("es_realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "es_snapshots" },
        (payload) => {
          if (selectedDate === today)
            setEsData((prev) => [...prev, payload.new as EsSnapshot]);
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedDate]);

  const lastEsTime = esData[esData.length - 1]?.created_at ?? null;
  return { esData, lastEsTime };
}
