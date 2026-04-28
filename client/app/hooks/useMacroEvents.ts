"use client";

import { useState, useEffect } from "react";
import { MacroEvent } from "../api/macro-events/route";

export function useMacroEvents(selectedDate: string) {
  const [events, setEvents] = useState<MacroEvent[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const res = await fetch(`/api/macro-events?date=${selectedDate}`);
        const data = await res.json();
        if (!cancelled) setEvents(data.events ?? []);
      } catch {
        if (!cancelled) setEvents([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    const t = setInterval(load, 5 * 60 * 1000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [selectedDate]);

  return { events, loading };
}
