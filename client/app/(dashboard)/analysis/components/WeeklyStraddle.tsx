"use client";

import { useMemo } from "react";
import { SessionData } from "../AnalysisDashboard";
import { THEME } from "../../../lib/theme";

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
  const d = new Date(dateStr + "T12:00:00Z");
  const day = d.getUTCDay();
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
      .slice(0, 8);
  }, [weeklyStraddles]);

  if (weeklies.length === 0) {
    return (
      <div className="flex items-center justify-center h-24 text-xs text-text-6">
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

        const weekSessions = sessions.filter((s) => {
          const sessionWeekStart = getWeekStart(s.date);
          return sessionWeekStart === weekStart;
        });

        const liveSpx = isCurrentWeek ? currentSpx : null;
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

        const rvColor =
          weekRV === null
            ? THEME.text2
            : weekRV >= 100
              ? THEME.regime.trend
              : weekRV >= 70
                ? THEME.regime.partial
                : THEME.text2;

        return (
          <div
            key={w.created_at}
            className={`bg-panel rounded p-4 ${isCurrentWeek ? "border border-border-2" : ""}`}
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                {isCurrentWeek && (
                  <span className="font-sans text-[10px] text-amber uppercase tracking-wide">
                    SEMANA ATUAL
                  </span>
                )}
                <span className="font-sans text-xs text-text-4">
                  Vencimento{" "}
                  <span className="text-text-3">{w.expiry_date}</span>
                </span>
                <span className="font-sans text-xs text-text-5">
                  capturado {capturedDate}
                </span>
              </div>
              <div className="flex items-center gap-4">
                {weekRV !== null && (
                  <span
                    className="font-mono text-xs"
                    style={{ color: rvColor }}
                  >
                    {weekRV.toFixed(1)}% RV/IV
                  </span>
                )}
                <span className="font-mono text-xs text-text-2">
                  ${w.straddle_mid.toFixed(2)} straddle
                </span>
              </div>
            </div>

            {/* Implied range display */}
            <div className="flex items-center gap-3 mb-2">
              <span
                className="font-mono text-xs w-16 text-right"
                style={{ color: THEME.down }}
              >
                {impliedLow.toFixed(0)}
              </span>
              <div className="flex-1 relative h-1.5 bg-border rounded">
                <div className="absolute inset-0 bg-border-2 rounded" />
                <div
                  className="absolute top-1/2 -translate-y-1/2 w-0.5 h-3"
                  style={{ backgroundColor: THEME.text5, left: "50%" }}
                />
                {positionPct !== null && (
                  <div
                    className="absolute"
                    style={{
                      left: `${positionPct}%`,
                      transform: "translateX(-50%)",
                    }}
                  >
                    <div className="font-mono text-[10px] text-text-2 text-center mb-0.5 whitespace-nowrap">
                      {refSpx?.toFixed(0)}
                    </div>
                    <div
                      className="w-1.5 h-1.5 rounded-full mx-auto"
                      style={{
                        backgroundColor: isOutsideRange
                          ? THEME.amber
                          : THEME.skew.moving,
                      }}
                    />
                  </div>
                )}
              </div>
              <span
                className="font-mono text-xs w-16"
                style={{ color: THEME.up }}
              >
                {impliedHigh.toFixed(0)}
              </span>
            </div>

            {/* Stats row */}
            <div className="flex gap-4 text-[11px]">
              <span className="text-text-4">
                SPX ref strike{" "}
                <span className="font-mono text-text-3">{w.atm_strike}</span>
              </span>
              {spxVsAtm !== null && (
                <span className="text-text-4">
                  curr. realized{" "}
                  <span
                    className="font-mono"
                    style={{
                      color: isOutsideRange ? THEME.amber : THEME.text2,
                    }}
                  >
                    {spxVsAtm > 0 ? "+" : ""}
                    {spxVsAtm}pts
                    {isOutsideRange && " ⚡ fora do range"}
                  </span>
                </span>
              )}
              {weekSessions.length > 0 && (
                <span className="text-text-4">
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
