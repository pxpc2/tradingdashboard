"use client";

import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { EsSnapshot } from "../types";

export function useEsData(selectedDate: string) {
  const [esData, setEsData] = useState<EsSnapshot[]>([]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const { data } = await supabase
        .from("es_snapshots")
        .select("*")
        .gte("created_at", `${selectedDate}T00:00:00`)
        .lt("created_at", `${selectedDate}T23:59:59`)
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

  return { esData };
}
