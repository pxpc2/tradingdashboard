"use client";

import { useSectors } from "../hooks/useSectors";
import { THEME } from "../lib/theme";

function fmtCt(d: Date): string {
  return d.toLocaleTimeString("en-GB", {
    timeZone: "America/Chicago",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

export default function Sectors() {
  const { sectors, loading, lastUpdated } = useSectors();

  const maxAbs = Math.max(0.5, ...sectors.map((s) => Math.abs(s.changePct)));

  return (
    <div className="bg-page border border-border-2 flex flex-col">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border-2 bg-panel">
        <span className="font-sans text-xs uppercase tracking-[0.05em] text-text-3">
          Sectors
        </span>
        <div className="flex items-center gap-2">
          {lastUpdated && (
            <span className="font-mono text-[9px] text-text-5">
              last updated: {fmtCt(lastUpdated)} CT
            </span>
          )}
        </div>
      </div>

      <div className="flex-1 px-3 py-2">
        {loading && sectors.length === 0 ? (
          <div className="flex items-center justify-center h-24 font-sans text-[10px] uppercase tracking-wide text-text-5">
            Loading…
          </div>
        ) : sectors.length === 0 ? (
          <div className="flex items-center justify-center h-24 font-sans text-[10px] uppercase tracking-wide text-text-5">
            No data
          </div>
        ) : (
          <div className="space-y-1">
            {sectors.map((s) => {
              const pctWidth = Math.min(
                48,
                (Math.abs(s.changePct) / maxAbs) * 48,
              );
              const positive = s.changePct >= 0;
              return (
                <div
                  key={s.sector}
                  className="flex items-center gap-2 font-mono text-[10px] leading-tight"
                >
                  <span
                    className="w-28 shrink-0"
                    style={{ color: THEME.text2 }}
                  >
                    {s.sector}
                  </span>
                  <div
                    className="flex-1 h-[6px] relative"
                    style={{ background: "var(--color-panel-2)" }}
                  >
                    <div
                      className="absolute top-0 bottom-0"
                      style={{
                        left: positive ? "50%" : `${50 - pctWidth}%`,
                        width: `${pctWidth}%`,
                        background: positive
                          ? "var(--color-up)"
                          : "var(--color-down)",
                      }}
                    />
                    <div
                      className="absolute top-0 bottom-0 w-px"
                      style={{
                        left: "50%",
                        background: "var(--color-border-2)",
                      }}
                    />
                  </div>
                  <span
                    className="w-10 text-right shrink-0"
                    style={{ color: positive ? THEME.up : THEME.down }}
                  >
                    {positive ? "+" : ""}
                    {s.changePct.toFixed(2)}%
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
