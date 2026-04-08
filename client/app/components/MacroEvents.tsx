"use client";

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

export default function MacroEvents({ selectedDate }: Props) {
  const { events, loading } = useMacroEvents(selectedDate);

  return (
    <div>
      <div className="flex items-center gap-3 mb-3">
        <div className="w-0.5 h-4 bg-[#2a2a2a]" style={{ borderRadius: 0 }} />
        <span className="font-sans text-[11px] text-[#666] uppercase tracking-widest">
          Macro
        </span>
      </div>

      {loading ? (
        <div className="font-mono text-[11px] text-[#333] py-4">loading...</div>
      ) : events.length === 0 ? (
        <div className="font-mono text-[11px] text-[#333] py-4">no events</div>
      ) : (
        <div className="w-full">
          <div className="grid grid-cols-[64px_1fr_80px_80px_80px] gap-x-4 pb-2 border-b border-[#1a1a1a]">
            <span className="font-sans text-[10px] text-[#444] uppercase tracking-widest">
              Time CT
            </span>
            <span className="font-sans text-[10px] text-[#444] uppercase tracking-widest">
              Event
            </span>
            <span className="font-sans text-[10px] text-[#444] uppercase tracking-widest text-right">
              Prev
            </span>
            <span className="font-sans text-[10px] text-[#444] uppercase tracking-widest text-right">
              Est
            </span>
            <span className="font-sans text-[10px] text-[#444] uppercase tracking-widest text-right">
              Actual
            </span>
          </div>
          <div
            className="macro-scroll"
            style={{ height: "250px", overflowY: "auto" }}
          >
            {events.map((e, i) => {
              const auction = isAuction(e.event);
              const hasActual = e.actual !== null;

              const actualColor = (() => {
                if (!hasActual || e.estimate === null) return "#9ca3af";
                const act = parseFloat(e.actual!);
                const est = parseFloat(e.estimate);
                if (isNaN(act) || isNaN(est)) return "#9ca3af";
                return act >= est ? "#4ade80" : "#f87171";
              })();

              const eventTextColor = auction ? "#60a5fa" : "#777";

              return (
                <div
                  key={i}
                  className="grid grid-cols-[64px_1fr_80px_80px_80px] gap-x-4 py-2 border-b border-[#111]"
                >
                  <span className="font-mono text-[11px] text-[#555]">
                    {e.timeCt}
                  </span>
                  <div className="flex items-center gap-2 min-w-0">
                    {eventDot(e.event, e.impact)}
                    <span
                      className="font-sans text-[11px] truncate"
                      style={{ color: eventTextColor }}
                    >
                      {e.event}
                    </span>
                  </div>
                  <span className="font-mono text-[11px] text-[#444] text-right">
                    {e.previous ?? "—"}
                  </span>
                  <span className="font-mono text-[11px] text-[#555] text-right">
                    {e.estimate ?? "—"}
                  </span>
                  <span
                    className="font-mono text-[11px] text-right"
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
