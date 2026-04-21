"use client";

import { useEffect, useState } from "react";
import { signOut } from "../login/actions";
import { FaSignOutAlt } from "react-icons/fa";
import Converter from "./Converter";

type Zone = { label: string; tz: string };

const ZONES: Zone[] = [
  { label: "CHI", tz: "America/Chicago" },
  { label: "NY", tz: "America/New_York" },
  { label: "BSB", tz: "America/Sao_Paulo" },
  { label: "LDN", tz: "Europe/London" },
];

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

type Props = {
  initialBasis: number | null;
};

export default function TopHeader({ initialBasis }: Props) {
  const [now, setNow] = useState<Date | null>(null);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);

  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    setLatencyMs(12); // TODO: wire real tick latency from useLiveTick
  }, []);

  const isLive = latencyMs !== null;

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

        {/* Spacer */}
        <div className="flex-1" />

        {/* Latency + clock + sign out */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="flex items-center gap-1.5 text-[10px]">
            <span
              className={isLive ? "text-up" : "text-down"}
              aria-hidden="true"
            >
              ●
            </span>
            <span className="font-mono text-text-2">
              {latencyMs !== null ? `${latencyMs}ms` : "—"}
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
