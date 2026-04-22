"use client";

import { useEffect, useState } from "react";
import { signOut } from "../login/actions";
import { FaSignOutAlt } from "react-icons/fa";
import Converter from "./Converter";
import { useLiveTick } from "../hooks/useLiveTick";
import { THEME } from "../lib/theme";

type Zone = { label: string; tz: string };

const ZONES: Zone[] = [
  { label: "CHI", tz: "America/Chicago" },
  { label: "NY", tz: "America/New_York" },
  { label: "BSB", tz: "America/Sao_Paulo" },
  { label: "LDN", tz: "Europe/London" },
];

const LATENCY_SYMBOLS = ["SPX"];

function formatHM(tz: string, d: Date): string {
  return d.toLocaleTimeString("en-GB", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function formatHMS(tz: string, d: Date): string {
  return d.toLocaleTimeString("en-GB", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function formatAge(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

type Props = {
  initialBasis: number | null;
};

export default function TopHeader({ initialBasis }: Props) {
  const [now, setNow] = useState<Date | null>(null);
  const [tickAgeMs, setTickAgeMs] = useState<number | null>(null);

  const ticks = useLiveTick(LATENCY_SYMBOLS);
  const spxTick = ticks["SPX"];

  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Recompute tick age every 250ms — gives snappy ms-level readout
  useEffect(() => {
    const interval = setInterval(() => {
      if (!spxTick?.lastUpdateMs) {
        setTickAgeMs(null);
        return;
      }
      setTickAgeMs(Date.now() - spxTick.lastUpdateMs);
    }, 250);
    return () => clearInterval(interval);
  }, [spxTick?.lastUpdateMs]);

  // Color thresholds
  // SPX can be quiet during low-volume periods, so be a bit generous
  const latencyColor =
    tickAgeMs === null
      ? THEME.text5
      : tickAgeMs < 2000
        ? THEME.up
        : tickAgeMs < 10_000
          ? THEME.amber
          : THEME.down;

  const isConnected = tickAgeMs !== null && tickAgeMs < 30_000;

  return (
    <div className="border-b border-border bg-panel sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 flex items-center h-7 gap-3">
        {/* Brand */}
        <div className="flex items-center gap-2 pr-3 border-r border-border-2 shrink-0">
          <div className="w-[13px] h-[13px] bg-skew-moving flex items-center justify-center">
            <span className="text-[9px] font-mono text-page font-medium">
              V
            </span>
          </div>
          <span className="font-sans text-[10px] text-text-2 tracking-[0.06em]">
            vovonacci·TERMINAL
          </span>
        </div>

        {/* Timezones */}
        <div className="flex items-center gap-3 text-[10px]">
          {ZONES.map((z) => (
            <div
              key={z.label}
              className="flex items-center gap-1 whitespace-nowrap"
            >
              <span className="font-sans text-text-4 uppercase tracking-wide">
                {z.label}
              </span>
              <span className="font-mono text-text-2">
                {now ? formatHM(z.tz, now) : "--:--"}
              </span>
            </div>
          ))}
        </div>

        <div className="w-px h-4 bg-border-2" />

        {/* Converter */}
        <Converter initialBasis={initialBasis} />

        {/* Latency + clock + sign out */}
        <div className="flex items-center gap-3 shrink-0">
          <div
            className="flex items-center gap-1.5 text-[10px]"
            title={
              isConnected
                ? `SPX tick age: ${tickAgeMs}ms`
                : "No recent SPX ticks"
            }
          >
            <span style={{ color: latencyColor }} aria-hidden="true">
              ●
            </span>
            <span className="font-mono" style={{ color: latencyColor }}>
              {tickAgeMs !== null ? formatAge(tickAgeMs) : "—"}
            </span>
          </div>
          <div className="w-px h-4 bg-border-2" />
          <span className="font-mono text-[10px] text-text-2">
            {now ? `${formatHMS("America/Chicago", now)} CT` : "--:--:-- CT"}
          </span>
          <div className="w-px h-4 bg-border-2" />
          <form action={signOut}>
            <button
              type="submit"
              className="text-text-4 hover:text-amber transition-colors hover:cursor-pointer"
              aria-label="Sign out"
            >
              <FaSignOutAlt className="text-sm" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
