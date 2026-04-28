"use client";

import { useEffect, useState } from "react";

let cached: string | null = null;
let inflight: Promise<string | null> | null = null;

async function fetchEsContract(): Promise<string | null> {
  if (cached) return cached;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const res = await fetch("/api/es-contract");
      if (!res.ok) return null;
      const { symbol } = (await res.json()) as { symbol?: string };
      if (symbol) cached = symbol;
      return cached;
    } catch {
      return null;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

export function useEsContract(): { esSymbol: string | null } {
  const [esSymbol, setEsSymbol] = useState<string | null>(cached);

  useEffect(() => {
    if (cached) {
      setEsSymbol(cached);
      return;
    }
    let active = true;
    fetchEsContract().then((sym) => {
      if (active) setEsSymbol(sym);
    });
    return () => {
      active = false;
    };
  }, []);

  return { esSymbol };
}
