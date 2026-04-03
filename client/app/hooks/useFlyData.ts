"use client";

import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { FlySnapshot, RtmSession } from "../types";

export function useFlyData(selectedDate: string, initialSession: RtmSession | null = null) {
  const [smlSession, setSmlSession] = useState<RtmSession | null>(initialSession);
  const [flySnapshots, setFlySnapshots] = useState<FlySnapshot[]>([]);

  // Fetch session + snapshots on date change
  useEffect(() => {
    let cancelled = false;
    async function load() {
      const { data: sessions } = await supabase
        .from("rtm_sessions")
        .select("*")
        .gte("created_at", `${selectedDate}T00:00:00`)
        .lt("created_at", `${selectedDate}T23:59:59`)
        .order("created_at", { ascending: false })
        .limit(1);

      const session = sessions?.[0] ?? null;

      let flyData: FlySnapshot[] = [];
      if (session) {
        const { data: snaps } = await supabase
          .from("sml_fly_snapshots")
          .select("*")
          .eq("session_id", session.id)
          .order("created_at", { ascending: true });
        flyData = snaps ?? [];
      }

      if (!cancelled) {
        setSmlSession(session);
        setFlySnapshots(flyData);
      }
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
      .channel("fly_realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "sml_fly_snapshots" },
        (payload) => {
          if (selectedDate === today)
            setFlySnapshots((prev) => [...prev, payload.new as FlySnapshot]);
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedDate]);

  function patchEntryMid(snapshotId: string, newMid: number) {
    setFlySnapshots((prev) =>
      prev.map((s) => (s.id === snapshotId ? { ...s, mid: newMid } : s)),
    );
  }

  return { smlSession, setSmlSession, flySnapshots, patchEntryMid };
}
