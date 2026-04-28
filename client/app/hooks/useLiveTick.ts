"use client";

import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";

export type TickData = {
  bid: number;
  ask: number;
  mid: number;
  prevClose: number | null;
  last: number | null;
  delta: number | null;
  gamma: number | null;
  theta: number | null;
  vega: number | null;
  iv: number | null;
  lastUpdateMs: number;
};

export function useLiveTick(symbols: string[]) {
  const [ticks, setTicks] = useState<Record<string, TickData>>({});

  useEffect(() => {
    if (symbols.length === 0) return;

    const applyPayload = (payload: Record<string, TickData>) => {
      setTicks((prev) => {
        const next = { ...prev };
        let changed = false;
        for (const sym of symbols) {
          if (payload[sym]) {
            next[sym] = payload[sym];
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    };

    const channel = supabase
      .channel("live-ticks")
      .on("broadcast", { event: "snapshot" }, (msg) =>
        applyPayload(msg.payload as Record<string, TickData>),
      )
      .on("broadcast", { event: "tick" }, (msg) =>
        applyPayload(msg.payload as Record<string, TickData>),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [symbols.join(",")]);

  return ticks;
}
