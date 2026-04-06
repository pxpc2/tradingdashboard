"use client";

import { useState } from "react";

type SourceStatus = "live" | "closed" | "error";

type Props = {
  lastStraddleTime: string | null;
  lastSkewTime: string | null;
  lastEsTime: string | null;
  lastQuoteTime: string | null;
  hasActivePositions: boolean;
};

function isRecent(timestamp: string | null, windowMs = 90 * 1000): boolean {
  if (!timestamp) return false;
  return Date.now() - new Date(timestamp).getTime() < windowMs;
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

function isSpxOpen(): boolean {
  const day = new Date().toLocaleDateString("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
  });
  const time = new Date().toLocaleTimeString("en-US", {
    timeZone: "America/New_York",
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  if (["Sat", "Sun"].includes(day)) return false;
  return time >= "09:30:00" && time < "16:00:00";
}

function isEsOpen(): boolean {
  const day = new Date().toLocaleDateString("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
  });
  const time = new Date().toLocaleTimeString("en-US", {
    timeZone: "America/New_York",
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  if (day === "Sat") return false;
  if (day === "Sun" && time < "18:00:00") return false;
  if (!["Sat", "Sun"].includes(day) && time >= "17:00:00" && time < "18:00:00")
    return false;
  return true;
}

function getSpxStatus(
  lastStraddleTime: string | null,
  lastSkewTime: string | null,
): SourceStatus {
  const spxOpen = isSpxOpen();
  if (!spxOpen) return "closed";
  // During RTH, both straddle and skew should have recent data
  // Straddle every 1min (90s window), skew every 5min (360s window)
  const straddleLive = isRecent(lastStraddleTime, 90 * 1000);
  const skewLive = isRecent(lastSkewTime, 360 * 1000);
  if (straddleLive && skewLive) return "live";
  return "error";
}

function getEsStatus(lastEsTime: string | null): SourceStatus {
  const esOpen = isEsOpen();
  if (!esOpen) return "closed";
  // ES every 1min - using 3min window
  if (isRecent(lastEsTime, 180 * 1000)) return "live";
  return "error";
}

function getVolStatus(
  lastStraddleTime: string | null,
  lastSkewTime: string | null,
): SourceStatus {
  const spxOpen = isSpxOpen();
  if (!spxOpen) return "closed";
  const straddleLive = isRecent(lastStraddleTime, 90 * 1000);
  const skewLive = isRecent(lastSkewTime, 360 * 1000);
  if (straddleLive && skewLive) return "live";
  return "error";
}

function getPosStatus(
  hasActivePositions: boolean,
  lastQuoteTime: string | null,
): SourceStatus {
  if (!hasActivePositions) return "closed";
  // Quotes refresh every 60s
  if (isRecent(lastQuoteTime, 120 * 1000)) return "live";
  return "error";
}

function statusColor(status: SourceStatus): string {
  if (status === "live") return "#4ade80";
  if (status === "error") return "#f87171";
  return "#333333";
}

function statusLabel(status: SourceStatus, lastTime: string | null): string {
  if (status === "live") return formatTime(lastTime);
  if (status === "error") return "sem dados";
  return "fechado";
}

export default function LiveIndicator({
  lastStraddleTime,
  lastSkewTime,
  lastEsTime,
  lastQuoteTime,
  hasActivePositions,
}: Props) {
  const [showTooltip, setShowTooltip] = useState(false);

  const spxStatus = getSpxStatus(lastStraddleTime, lastSkewTime);
  const esStatus = getEsStatus(lastEsTime);
  const volStatus = getVolStatus(lastStraddleTime, lastSkewTime);
  const posStatus = getPosStatus(hasActivePositions, lastQuoteTime);

  const statuses = [
    { label: "SPX", status: spxStatus, lastTime: lastStraddleTime },
    { label: "ES", status: esStatus, lastTime: lastEsTime },
    { label: "Volatilidade", status: volStatus, lastTime: lastSkewTime },
    { label: "Posições", status: posStatus, lastTime: lastQuoteTime },
  ];

  const hasError = statuses.some((s) => s.status === "error");
  const spxOpen = isSpxOpen();
  const esOpen = isEsOpen();

  const dotColor = hasError
    ? "#f87171"
    : !spxOpen && !esOpen
      ? "#333333"
      : spxOpen
        ? "#4ade80"
        : "#fb923c"; // orange — ES open but SPX closed

  const shouldPulse = !hasError && (spxOpen || esOpen);

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
        <div className="absolute right-0 top-6 bg-[#1a1a1a] border border-[#2a2a2a] rounded-sm p-3 z-50 min-w-52 shadow-lg">
          <div className="flex flex-col gap-2">
            {statuses.map((s) => (
              <div
                key={s.label}
                className="flex items-center justify-between gap-4"
              >
                <div className="flex items-center gap-2">
                  <div
                    className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: statusColor(s.status) }}
                  />
                  <span className="text-xs text-[#888]">{s.label}</span>
                </div>
                <span className="text-xs text-[#444]">
                  {statusLabel(s.status, s.lastTime)}
                </span>
              </div>
            ))}
          </div>
          {!spxOpen && !esOpen && (
            <div className="mt-2 pt-2 border-t border-[#2a2a2a] text-xs text-[#333]">
              mercado fechado
            </div>
          )}
          {!spxOpen && esOpen && (
            <div className="mt-2 pt-2 border-t border-[#2a2a2a] text-xs text-[#555]">
              overnight aberto
            </div>
          )}
        </div>
      )}
    </div>
  );
}
