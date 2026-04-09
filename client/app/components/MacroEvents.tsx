"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useMacroEvents } from "../hooks/useMacroEvents";
import { MacroEvent } from "../api/macro-events/route";

type Props = {
  selectedDate: string;
};

function isAuction(event: string): boolean {
  return event.toLowerCase().includes("auction");
}

function impactColor(impact: MacroEvent["impact"]): string {
  switch (impact) {
    case "High":
      return "#f87171";
    case "Medium":
      return "#f59e0b";
    case "Low":
      return "#333";
  }
}

function eventDot(event: string, impact: MacroEvent["impact"]) {
  const color = isAuction(event) ? "#60a5fa" : impactColor(impact);
  return (
    <span
      className="inline-block w-1.5 h-1.5 rounded-full shrink-0"
      style={{ backgroundColor: color }}
    />
  );
}

function currentCtTime(): string {
  return new Date().toLocaleTimeString("en-US", {
    timeZone: "America/Chicago",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function findNextIndex(events: MacroEvent[]): number {
  const now = currentCtTime();
  return events.findIndex((e) => e.actual === null && e.timeCt >= now);
}

export default function MacroEvents({ selectedDate }: Props) {
  const { events, loading } = useMacroEvents(selectedDate);
  const [nextIndex, setNextIndex] = useState<number>(-1);
  const [userScrolled, setUserScrolled] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef<(HTMLDivElement | null)[]>([]);
  const userScrolledRef = useRef(false);

  const scrollToNext = useCallback((idx: number) => {
    if (idx < 0 || !rowRefs.current[idx]) return;
    rowRefs.current[idx]?.scrollIntoView({
      block: "start",
      behavior: "smooth",
    });
  }, []);

  useEffect(() => {
    if (events.length === 0) return;
    const update = () => {
      const idx = findNextIndex(events);
      setNextIndex(idx);
      if (!userScrolledRef.current) scrollToNext(idx);
    };
    update();
    const interval = setInterval(update, 30_000);
    return () => clearInterval(interval);
  }, [events, scrollToNext]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const handleScroll = () => {
      userScrolledRef.current = true;
      setUserScrolled(true);
    };
    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => el.removeEventListener("scroll", handleScroll);
  }, []);

  function handleGoToNow() {
    userScrolledRef.current = false;
    setUserScrolled(false);
    scrollToNext(nextIndex);
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-3">
        <div className="w-0.5 h-4 bg-[#2a2a2a]" style={{ borderRadius: 0 }} />
        <span className="font-sans text-[11px] text-[#666] uppercase tracking-widest">
          Macro
        </span>
        {userScrolled && nextIndex >= 0 && (
          <button
            onClick={handleGoToNow}
            className="font-sans text-[10px] text-[#444] uppercase tracking-widest hover:text-[#666] transition-colors hover:cursor-pointer ml-auto"
          >
            ↓ now
          </button>
        )}
      </div>

      {loading ? (
        <div className="font-mono text-[11px] text-[#333] py-4">loading...</div>
      ) : events.length === 0 ? (
        <div className="font-mono text-[11px] text-[#333] py-4">no events</div>
      ) : (
        <div className="w-full">
          {/* Header — mobile: time + event only / desktop: full columns */}
          <div className="grid grid-cols-[56px_1fr] md:grid-cols-[64px_1fr_80px_80px_80px] gap-x-4 pb-2 border-b border-[#1a1a1a]">
            <span className="font-sans text-[10px] text-[#444] uppercase tracking-widest">
              Time CT
            </span>
            <span className="font-sans text-[10px] text-[#444] uppercase tracking-widest">
              Event
            </span>
            <span className="hidden md:block font-sans text-[10px] text-[#444] uppercase tracking-widest text-right">
              Prev
            </span>
            <span className="hidden md:block font-sans text-[10px] text-[#444] uppercase tracking-widest text-right">
              Est
            </span>
            <span className="hidden md:block font-sans text-[10px] text-[#444] uppercase tracking-widest text-right">
              Actual
            </span>
          </div>

          <div
            ref={scrollRef}
            className="macro-scroll"
            style={{ height: "300px", overflowY: "auto" }}
          >
            {events.map((e, i) => {
              const auction = isAuction(e.event);
              const isNext = i === nextIndex;
              const hasActual = e.actual !== null;

              const actualColor = (() => {
                if (!hasActual || e.estimate === null) return "#9ca3af";
                const act = parseFloat(e.actual!);
                const est = parseFloat(e.estimate);
                if (isNaN(act) || isNaN(est)) return "#9ca3af";
                return act >= est ? "#4ade80" : "#f87171";
              })();

              return (
                <div
                  key={i}
                  ref={(el) => {
                    rowRefs.current[i] = el;
                  }}
                  className="grid grid-cols-[56px_1fr] md:grid-cols-[64px_1fr_80px_80px_80px] gap-x-4 py-2 border-b border-[#111] transition-colors"
                  style={{
                    backgroundColor: isNext ? "#212121" : "transparent",
                    borderLeft: isNext
                      ? "2px solid #555"
                      : "2px solid transparent",
                    paddingLeft: isNext ? "6px" : "0",
                  }}
                >
                  <span
                    className="font-mono text-[11px]"
                    style={{ color: isNext ? "#888" : "#555" }}
                  >
                    {e.timeCt}
                  </span>
                  <div className="flex items-center gap-2 min-w-0">
                    {eventDot(e.event, e.impact)}
                    <span
                      className="font-sans text-[11px] truncate"
                      style={{ color: auction ? "#60a5fa" : "#777" }}
                    >
                      {e.event}
                    </span>
                    {/* Actual value shown inline on mobile when available */}
                    {hasActual && (
                      <span
                        className="md:hidden font-mono text-[11px] ml-auto shrink-0"
                        style={{ color: actualColor }}
                      >
                        {e.actual}
                      </span>
                    )}
                  </div>
                  <span className="hidden md:block font-mono text-[11px] text-[#444] text-right">
                    {e.previous ?? "—"}
                  </span>
                  <span className="hidden md:block font-mono text-[11px] text-[#555] text-right">
                    {e.estimate ?? "—"}
                  </span>
                  <span
                    className="hidden md:block font-mono text-[11px] text-right"
                    style={{ color: hasActual ? actualColor : "#333" }}
                  >
                    {e.actual ?? "—"}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
