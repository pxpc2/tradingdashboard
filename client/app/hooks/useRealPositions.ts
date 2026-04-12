"use client";

import { useState, useEffect } from "react";
import { PositionLeg } from "../api/real-positions/route";

export function useRealPositions() {
  const [legs, setLegs] = useState<PositionLeg[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setIsLoading(true);
      try {
        const res = await fetch("/api/real-positions");
        const data = await res.json();
        if (!cancelled) {
          setLegs(data.legs ?? []);
          setError(null);
        }
      } catch (err: unknown) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Failed to load positions",
          );
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    load();
    const interval = setInterval(load, 30000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const streamerSymbols = legs.map((l) => l.streamerSymbol);

  return { legs, streamerSymbols, isLoading, error };
}
