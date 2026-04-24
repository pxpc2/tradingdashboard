"use client";

import { useEffect, useState } from "react";
import type { SectorItem } from "../api/sectors/route";

export function useSectors(): {
  sectors: SectorItem[];
  loading: boolean;
  lastUpdated: Date | null;
} {
  const [sectors, setSectors] = useState<SectorItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/sectors");
        const json = await res.json();
        if (!cancelled) {
          setSectors(json.sectors ?? []);
          setLastUpdated(new Date());
        }
      } catch {
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    const t = setInterval(load, 60 * 1000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  return { sectors, loading, lastUpdated };
}
