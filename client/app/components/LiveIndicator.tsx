"use client";

import { useState } from "react";

type LiveStatus = {
  label: string;
  live: boolean;
  lastTime: string | null;
  inactive?: boolean;
};

type Props = {
  lastStraddleTime: string | null;
  lastFlyTime: string | null;
  hasActiveSession: boolean;
  lastQuoteTime: string | null;
  hasActivePositions: boolean;
  lastSkewTime: string | null;
};

function isRecent(timestamp: string | null): boolean {
  if (!timestamp) return false;
  const diff = Date.now() - new Date(timestamp).getTime();
  return diff < 90 * 1000;
}

function formatTime(timestamp: string | null): string {
  if (!timestamp) return "—";
  return new Date(timestamp).toLocaleTimeString("en-US", {
    timeZone: "America/Chicago",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function isMarketHours(): boolean {
  const now = new Date();
  const day = now.toLocaleDateString("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
  });
  const time = now.toLocaleTimeString("en-US", {
    timeZone: "America/New_York",
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  if (["Sat", "Sun"].includes(day)) return false;
  if (time < "09:30:00" || time >= "16:00:00") return false;
  return true;
}

export default function LiveIndicator({
  lastStraddleTime,
  lastFlyTime,
  hasActiveSession,
  lastQuoteTime,
  hasActivePositions,
  lastSkewTime,
}: Props) {
  const [showTooltip, setShowTooltip] = useState(false);
  const duringMarketHours = isMarketHours();

  const statuses: LiveStatus[] = [
    {
      label: "Straddle",
      live: isRecent(lastStraddleTime),
      lastTime: lastStraddleTime,
      inactive: !duringMarketHours,
    },
    {
      label: "SML Fly",
      live: hasActiveSession && isRecent(lastFlyTime),
      lastTime: lastFlyTime,
      inactive: !hasActiveSession,
    },
    {
      label: "Skew",
      live: isRecent(lastSkewTime),
      lastTime: lastSkewTime,
      inactive: !duringMarketHours,
    },
    {
      label: "Posições",
      live: hasActivePositions && isRecent(lastQuoteTime),
      lastTime: lastQuoteTime,
      inactive: !hasActivePositions,
    },
  ];

  const activeSources = statuses.filter((s) => !s.inactive);
  const allLive =
    activeSources.length > 0 && activeSources.every((s) => s.live);
  const someLive = activeSources.some((s) => s.live);

  const dotColor = !duringMarketHours
    ? "#333333"
    : allLive
      ? "#4ade80"
      : someLive
        ? "#f59e0b"
        : "#f87171";

  const shouldPulse = duringMarketHours && allLive;

  return (
    <div
      className="relative flex items-center"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <div className="relative flex items-center justify-center w-4 h-4 cursor-default hover:cursor-pointer">
        {shouldPulse && (
          <div
            className="absolute w-4 h-4 rounded-full animate-ping opacity-40"
            style={{ backgroundColor: dotColor }}
          />
        )}
        <div
          className="w-2 h-2 rounded-full"
          style={{ backgroundColor: dotColor }}
        />
      </div>

      {showTooltip && (
        <div className="absolute right-0 top-6 bg-[#1a1a1a] border border-[#2a2a2a] rounded-sm p-3 z-50 min-w-48 shadow-lg">
          <div className="flex flex-col gap-2">
            {statuses.map((status) => (
              <div
                key={status.label}
                className="flex items-center justify-between gap-4"
              >
                <div className="flex items-center gap-2">
                  <div
                    className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                    style={{
                      backgroundColor: status.inactive
                        ? "#333"
                        : status.live
                          ? "#4ade80"
                          : duringMarketHours
                            ? "#f87171"
                            : "#333",
                    }}
                  />
                  <span className="text-xs text-[#888]">{status.label}</span>
                </div>
                <span className="text-xs text-[#444]">
                  {status.inactive
                    ? "inativo"
                    : status.live
                      ? formatTime(status.lastTime)
                      : duringMarketHours
                        ? "sem dados"
                        : "fora do horário"}
                </span>
              </div>
            ))}
          </div>
          {!duringMarketHours && (
            <div className="mt-2 pt-2 border-t border-[#2a2a2a] text-xs text-[#333]">
              mercado fechado
            </div>
          )}
        </div>
      )}
    </div>
  );
}
