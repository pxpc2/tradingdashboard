"use client";

import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { EsSnapshot } from "../types";

export function useEsData(selectedDate: string) {
  const [esData, setEsData] = useState<EsSnapshot[]>([]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const date = new Date(`${selectedDate}T00:00:00Z`);
      const prevDay = new Date(date);
      prevDay.setUTCDate(prevDay.getUTCDate() - 1);
      const nextDay = new Date(date);
      nextDay.setUTCDate(nextDay.getUTCDate() + 1);

      const from = `${prevDay.toISOString().slice(0, 10)}T06:00:00Z`;
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
  }, [selectedDate]);

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
