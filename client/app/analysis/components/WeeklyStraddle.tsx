"use client";

import { useMemo } from "react";
import { SessionData } from "../AnalysisDashboard";

type WeeklyStraddleRow = {
  created_at: string;
  expiry_date: string;
  spx_ref: number;
  atm_strike: number;
  straddle_mid: number;
  call_bid: number;
  call_ask: number;
  put_bid: number;
  put_ask: number;
};

type Props = {
  weeklyStraddles: WeeklyStraddleRow[];
  sessions: SessionData[];
  currentSpx: number | null;
};

function getETDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-CA", {
    timeZone: "America/New_York",
  });
}

function getWeekStart(dateStr: string): string {
  // Get the Monday of the week containing this date
  const d = new Date(dateStr + "T12:00:00Z");
  const day = d.getUTCDay(); // 0=Sun, 1=Mon...
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

export default function WeeklyStraddle({
  weeklyStraddles,
  sessions,
  currentSpx,
}: Props) {
  const weeklies = useMemo(() => {
    return [...weeklyStraddles]
      .sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      )
      .slice(0, 8); // last 8 weeks
  }, [weeklyStraddles]);

  if (weeklies.length === 0) {
    return (
      <div className="flex items-center justify-center h-24 text-xs text-[#333]">
        Nenhum dado de straddle semanal — disponível após primeira segunda-feira
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {weeklies.map((w, idx) => {
        const impliedHigh = w.atm_strike + w.straddle_mid;
        const impliedLow = w.atm_strike - w.straddle_mid;
        const capturedDate = getETDate(w.created_at);
        const weekStart = getWeekStart(capturedDate);
        const isCurrentWeek = idx === 0;

        // Get sessions for this week
        const weekSessions = sessions.filter((s) => {
          const sessionWeekStart = getWeekStart(s.date);
          return sessionWeekStart === weekStart;
        });

        // Current SPX vs implied range (only for current week)
        const liveSpx = isCurrentWeek ? currentSpx : null;
        const weekHighSpx =
          weekSessions.length > 0
            ? Math.max(...weekSessions.map((s) => s.openingSpx + s.maxMovePts))
            : null;
        const weekLowSpx =
          weekSessions.length > 0
            ? Math.min(...weekSessions.map((s) => s.openingSpx - s.maxMovePts))
            : null;

        // EOD realized for the week (use last session's closing SPX vs opening)
        const firstSession = weekSessions[0];
        const lastSession = weekSessions[weekSessions.length - 1];
        const weekRealizedMove =
          firstSession && lastSession
            ? Math.abs(lastSession.closingSpx - firstSession.openingSpx)
            : null;
        const weekRV =
          weekRealizedMove !== null
            ? (weekRealizedMove / w.straddle_mid) * 100
            : null;

        // Position bar: where is SPX relative to implied range
        const refSpx = liveSpx ?? lastSession?.closingSpx ?? null;
        const rangeWidth = w.straddle_mid * 2;
        const positionPct =
          refSpx !== null
            ? Math.max(
                0,
                Math.min(100, ((refSpx - impliedLow) / rangeWidth) * 100),
              )
            : null;

        const spxVsAtm =
          refSpx !== null
            ? parseFloat((refSpx - w.atm_strike).toFixed(2))
            : null;

        const isOutsideRange =
          refSpx !== null && (refSpx > impliedHigh || refSpx < impliedLow);

        return (
          <div
            key={w.created_at}
            className={`bg-[#111] rounded p-4 ${isCurrentWeek ? "border border-[#222]" : ""}`}
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                {isCurrentWeek && (
                  <span className="font-sans text-[10px] text-[#f59e0b] uppercase tracking-wide">
                    SEMANA ATUAL
                  </span>
                )}
                <span className="font-sans text-xs text-[#555]">
                  Vencimento{" "}
                  <span className="text-[#666]">{w.expiry_date}</span>
                </span>
                <span className="font-sans text-xs text-[#444]">
                  capturado {capturedDate}
                </span>
              </div>
              <div className="flex items-center gap-4">
                {weekRV !== null && (
                  <span
                    className="font-mono text-xs"
                    style={{
                      color:
                        weekRV >= 100
                          ? "#f87171"
                          : weekRV >= 70
                            ? "#f59e0b"
                            : "#9ca3af",
                    }}
                  >
                    {weekRV.toFixed(1)}% RV/IV
                  </span>
                )}
                <span className="font-mono text-xs text-[#9ca3af]">
                  ${w.straddle_mid.toFixed(2)} straddle
                </span>
              </div>
            </div>

            {/* Implied range display */}
            <div className="flex items-center gap-3 mb-2">
              <span className="font-mono text-xs text-[#f87171] w-16 text-right">
                {impliedLow.toFixed(0)}
              </span>
              <div className="flex-1 relative h-1.5 bg-[#1a1a1a] rounded">
                {/* Range bar */}
                <div className="absolute inset-0 bg-[#2a2a2a] rounded" />
                {/* ATM marker */}
                <div
                  className="absolute top-1/2 -translate-y-1/2 w-0.5 h-3 bg-[#444]"
                  style={{ left: "50%" }}
                />
                {/* SPX position */}
                {positionPct !== null && (
                  <div
                    className="absolute"
                    style={{
                      left: `${positionPct}%`,
                      transform: "translateX(-50%)",
                    }}
                  >
                    {/* Price label above */}
                    <div className="font-mono text-[10px] text-[#9ca3af] text-center mb-0.5 whitespace-nowrap">
                      {refSpx?.toFixed(0)}
                    </div>
                    {/* Dot */}
                    <div
                      className="w-1.5 h-1.5 rounded-full mx-auto"
                      style={{
                        backgroundColor: isOutsideRange ? "#9CA9FF" : "#9CA9FF",
                      }}
                    />
                  </div>
                )}
              </div>
              <span className="font-mono text-xs text-[#4ade80] w-16">
                {impliedHigh.toFixed(0)}
              </span>
            </div>

            {/* Stats row */}
            <div className="flex gap-4 text-[11px]">
              <span className="text-[#555]">
                SPX ref strike{" "}
                <span className="font-mono text-[#666]">{w.atm_strike}</span>
              </span>
              {spxVsAtm !== null && (
                <span className="text-[#555]">
                  curr. realized{" "}
                  <span
                    className="font-mono"
                    style={{ color: isOutsideRange ? "#f87171" : "#9ca3af" }}
                  >
                    {spxVsAtm > 0 ? "+" : ""}
                    {spxVsAtm}pts
                    {isOutsideRange && " ⚡ fora do range"}
                  </span>
                </span>
              )}
              {weekSessions.length > 0 && (
                <span className="text-[#555]">
                  {weekSessions.length} sessão
                  {weekSessions.length !== 1 ? "ões" : ""}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
