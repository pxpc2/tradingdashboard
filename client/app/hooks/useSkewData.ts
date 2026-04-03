"use client";

import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { SkewSnapshot } from "../types";

export function useSkewData(selectedDate: string) {
  const [skewSnapshots, setSkewSnapshots] = useState<SkewSnapshot[]>([]);

  // Fetch on date change
  useEffect(() => {
    let cancelled = false;
    async function load() {
      const { data } = await supabase
        .from("skew_snapshots")
        .select("*")
        .gte("created_at", `${selectedDate}T00:00:00`)
        .lt("created_at", `${selectedDate}T23:59:59`)
        .order("created_at", { ascending: true });
      if (!cancelled) setSkewSnapshots(data ?? []);
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
      .channel("skew_realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "skew_snapshots" },
        (payload) => {
          if (selectedDate === today)
            setSkewSnapshots((prev) => [...prev, payload.new as SkewSnapshot]);
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedDate]);

  return { skewSnapshots };
}
