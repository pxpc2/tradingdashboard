"use client";

import { useMemo, useState, useEffect } from "react";
import { useMacroEvents } from "../hooks/useMacroEvents";
import { MacroEvent } from "../api/macro-events/route";
import { THEME } from "../lib/theme";

type Props = {
  selectedDate: string;
  height?: number;
};

function isAuction(event: string): boolean {
  return event.toLowerCase().includes("auction");
}

function impactColor(impact: MacroEvent["impact"]): string {
  if (impact === "High") return THEME.down;
  if (impact === "Medium") return THEME.amber;
  return THEME.text5;
}

function actualColor(e: MacroEvent): string {
  if (e.actual === null || e.estimate === null) return THEME.text3;
  const act = parseFloat(e.actual);
  const est = parseFloat(e.estimate);
  if (isNaN(act) || isNaN(est)) return THEME.text3;
  return act >= est ? THEME.up : THEME.down;
}

function nowCtMinutes(): number {
  const parts = new Date()
    .toLocaleTimeString("en-GB", {
      timeZone: "America/Chicago",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    })
    .split(":");
  return parseInt(parts[0]) * 60 + parseInt(parts[1]);
}

function eventMinutes(timeCt: string): number | null {
  const m = timeCt.match(/^(\d{2}):(\d{2})/);
  if (!m) return null;
  return parseInt(m[1]) * 60 + parseInt(m[2]);
}

export default function CalendarFixedHeight({
  selectedDate,
  height = 740,
}: Props) {
  const { events, loading } = useMacroEvents(selectedDate);

  const [nowMin, setNowMin] = useState<number | null>(null);
  useEffect(() => {
    setNowMin(nowCtMinutes());
    const t = setInterval(() => setNowMin(nowCtMinutes()), 30_000);
    return () => clearInterval(t);
  }, []);

  const nextIndex = useMemo(() => {
    if (events.length === 0 || nowMin === null) return -1;
    return events.findIndex((e) => {
      if (e.actual !== null) return false;
      const mins = eventMinutes(e.timeCt);
      return mins !== null && mins >= nowMin;
    });
  }, [events, nowMin]);

  const nextLabel = useMemo(() => {
    if (nextIndex < 0) return null;
    return events[nextIndex]?.timeCt ?? null;
  }, [events, nextIndex]);

  return (
    <div
      className="bg-page border border-border-2 flex flex-col"
      style={{ height }}
    >
      <div className="flex items-center justify-between px-3 py-2 border-b border-border-2 shrink-0 bg-panel">
        <span className="font-sans text-xs uppercase tracking-[0.05em] text-text-3">
          Economic Calendar
        </span>
        {nextLabel && (
          <span
            className="font-mono text-xs uppercase tracking-wide"
            style={{ color: THEME.amber }}
          >
            Next {nextLabel} CT
          </span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto calendar-scroll">
        {loading && events.length === 0 ? (
          <div className="py-8 text-center">
            <span className="font-sans text-[10px] uppercase tracking-wide text-text-5">
              Loading…
            </span>
          </div>
        ) : events.length === 0 ? (
          <div className="py-8 text-center">
            <span className="font-sans text-[10px] uppercase tracking-wide text-text-5">
              No events today
            </span>
          </div>
        ) : (
          <div className="py-1">
            {events.map((e, i) => {
              const isNext = i === nextIndex;
              const auction = isAuction(e.event);
              const dotColor = auction ? THEME.indigo : impactColor(e.impact);
              const hasActual = e.actual !== null;
              const actColor = actualColor(e);

              return (
                <div
                  key={i}
                  className="flex items-center gap-2 px-3 py-1 text-[11px]"
                  style={{
                    background: isNext ? "rgba(245, 165, 36, 0.08)" : undefined,
                  }}
                >
                  <span
                    className="font-mono text-[10px] w-10 shrink-0"
                    style={{ color: isNext ? THEME.amber : THEME.text4 }}
                  >
                    {e.timeCt}
                  </span>
                  <span
                    className="shrink-0 text-[8px]"
                    style={{ color: dotColor }}
                    aria-label={e.impact}
                  >
                    ■
                  </span>
                  <span
                    className="flex-1 font-sans truncate"
                    style={{
                      color: auction
                        ? THEME.indigo
                        : isNext
                          ? THEME.text
                          : THEME.text2,
                    }}
                    title={e.event}
                  >
                    {e.event}
                  </span>
                  {hasActual && (
                    <span
                      className="font-mono text-[10px] shrink-0 text-right min-w-[40px]"
                      style={{ color: actColor }}
                    >
                      {e.actual}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <style>{`
        .calendar-scroll::-webkit-scrollbar {
          width: 3px;
        }
        .calendar-scroll::-webkit-scrollbar-track {
          background: transparent;
        }
        .calendar-scroll::-webkit-scrollbar-thumb {
          background: var(--color-border-2);
          border-radius: 0;
        }
        .calendar-scroll {
          scrollbar-width: thin;
          scrollbar-color: var(--color-border-2) transparent;
        }
      `}</style>
    </div>
  );
}
