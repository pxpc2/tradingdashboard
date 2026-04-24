"use client";

import { useEffect, useState } from "react";
import type { SectorItem } from "../api/sectors/route";

export function useSectors(): { sectors: SectorItem[]; loading: boolean } {
  const [sectors, setSectors] = useState<SectorItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/sectors");
        const json = await res.json();
        if (!cancelled) setSectors(json.sectors ?? []);
      } catch {
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
  }, []);

  return { sectors, loading };
}
