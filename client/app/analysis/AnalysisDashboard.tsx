"use client";

import { useMemo } from "react";
import Link from "next/link";
import { signOut } from "../login/actions";
import ImpliedVsRealized from "./components/ImpliedVsRealized";
import RatioHistogram from "./components/RatioHistogram";
import DecayCurve from "./components/DecayCurve";
import { FaSignOutAlt } from "react-icons/fa";

type StraddleSnapshot = {
  created_at: string;
  spx_ref: number;
  atm_strike: number;
  straddle_mid: number;
  es_basis: number | null;
};

type SkewSnapshot = {
  created_at: string;
  skew: number;
  put_iv: number;
  call_iv: number;
  atm_iv: number;
};

export type SessionData = {
  date: string;
  dayOfWeek: string;
  openingStraddle: number;
  openingSpx: number;
  openingSkew: number | null;
  closingSpx: number;
  realizedMovePts: number;
  realizedMovePct: number;
  maxMovePts: number;
  maxMovePct: number;
  snapshots: StraddleSnapshot[];
};

type Props = {
  straddleSnapshots: StraddleSnapshot[];
  skewSnapshots: SkewSnapshot[];
};

function getETDate(isoString: string): string {
  return new Date(isoString).toLocaleDateString("en-CA", {
    timeZone: "America/New_York",
  });
}

function getDayOfWeek(dateStr: string): string {
  return new Date(dateStr + "T12:00:00Z").toLocaleDateString("en-US", {
    weekday: "short",
  });
}

export default function AnalysisDashboard({
  straddleSnapshots,
  skewSnapshots,
}: Props) {
  const sessions = useMemo((): SessionData[] => {
    const byDate = new Map<string, StraddleSnapshot[]>();
    for (const s of straddleSnapshots) {
      const date = getETDate(s.created_at);
      if (!byDate.has(date)) byDate.set(date, []);
      byDate.get(date)!.push(s);
    }

    const skewByDate = new Map<string, number>();
    for (const s of skewSnapshots) {
      const date = getETDate(s.created_at);
      if (!skewByDate.has(date)) skewByDate.set(date, s.skew);
    }

    const result: SessionData[] = [];
    for (const [date, snaps] of byDate) {
      if (snaps.length < 2) continue;
      const sorted = [...snaps].sort(
        (a, b) =>
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      );
      const opening = sorted[0];
      const closing = sorted[sorted.length - 1];
      if (!opening.straddle_mid || opening.straddle_mid <= 0) continue;

      const openSpx = opening.spx_ref;
      const closeSpx = closing.spx_ref;
      const maxSpx = Math.max(...sorted.map((s) => s.spx_ref));
      const minSpx = Math.min(...sorted.map((s) => s.spx_ref));
      const realizedMovePts = Math.abs(closeSpx - openSpx);
      const maxMovePts = Math.max(maxSpx - openSpx, openSpx - minSpx);
      const realizedMovePct = (realizedMovePts / opening.straddle_mid) * 100;
      const maxMovePct = (maxMovePts / opening.straddle_mid) * 100;

      result.push({
        date,
        dayOfWeek: getDayOfWeek(date),
        openingStraddle: opening.straddle_mid,
        openingSpx: openSpx,
        openingSkew: skewByDate.get(date) ?? null,
        closingSpx: closeSpx,
        realizedMovePts,
        realizedMovePct,
        maxMovePts,
        maxMovePct,
        snapshots: sorted,
      });
    }

    return result.sort((a, b) => a.date.localeCompare(b.date));
  }, [straddleSnapshots, skewSnapshots]);

  const sessionCount = sessions.length;

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      {/* Header */}
      <div className="border-b border-[#1a1a1a] bg-[#0a0a0a] sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 md:px-6 flex items-center justify-between h-10">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="font-sans text-xs text-[#555] hover:text-[#f59e0b] transition-colors uppercase tracking-widest"
            >
              ← voltar p/ home
            </Link>
            <div className="w-px h-4 bg-[#1a1a1a]" />
          </div>
          <div className="flex items-center gap-3">
            <span className="font-mono text-xs text-[#444]">
              {sessionCount} session{sessionCount !== 1 ? "s" : ""}
            </span>
            <div className="w-px h-4 bg-[#1a1a1a]" />
            <form action={signOut}>
              <button
                type="submit"
                className="font-sans text-xs text-[#555] hover:text-[#666] transition-colors hover:cursor-pointer uppercase tracking-widest"
              >
                <FaSignOutAlt className="text-md hover:text-[#f59e0b]" />
              </button>
            </form>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 space-y-8">
        {sessionCount < 2 ? (
          <div className="flex items-center justify-center h-64 text-xs text-[#444] uppercase tracking-wide">
            Not enough sessions yet — check back after a few trading days
          </div>
        ) : (
          <>
            {/* Row 1: Scatter + Histogram */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-0.5 h-4 bg-[#333]" />
                  <span className="font-sans text-xs text-[#666] uppercase tracking-wide">
                    Implied vs Realized
                  </span>
                </div>
                <ImpliedVsRealized sessions={sessions} />
              </div>
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-0.5 h-4 bg-[#333]" />
                  <span className="font-sans text-xs text-[#666] uppercase tracking-wide">
                    DISTRIBUIÇÃO Realized / Implied
                  </span>
                </div>
                <RatioHistogram sessions={sessions} />
              </div>
            </div>

            {/* Row 2: Decay curve */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-0.5 h-4 bg-[#333]" />
                <span className="font-sans text-xs text-[#666] uppercase tracking-wide">
                  Straddle Decay — média (avg) vs hoje
                </span>
              </div>
              <DecayCurve
                sessions={sessions}
                straddleSnapshots={straddleSnapshots}
              />
            </div>

            {/* Row 3: Session table */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-0.5 h-4 bg-[#333]" />
                <span className="font-sans text-xs text-[#666] uppercase tracking-wide">
                  Tabela sessões
                </span>
              </div>
              <div className="bg-[#111] rounded overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-[#1a1a1a]">
                      {[
                        "Data",
                        "Dia",
                        "Implied",
                        "Realized",
                        "Max",
                        "RV/IV",
                        "Skew",
                      ].map((h) => (
                        <th
                          key={h}
                          className="font-sans text-[11px] text-[#555] uppercase tracking-wide text-left px-4 py-2.5 font-normal"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[...sessions].reverse().map((s) => {
                      const ratio = s.realizedMovePct / 100;
                      const ratioColor =
                        ratio >= 1
                          ? "#f87171"
                          : ratio >= 0.7
                            ? "#f59e0b"
                            : "#9ca3af";
                      return (
                        <tr
                          key={s.date}
                          className="border-b border-[#1a1a1a] last:border-0 hover:bg-[#151515] transition-colors"
                        >
                          <td className="font-mono text-sm text-[#9ca3af] px-4 py-2.5">
                            {s.date}
                          </td>
                          <td className="font-sans text-sm text-[#666] px-4 py-2.5">
                            {s.dayOfWeek}
                          </td>
                          <td className="font-mono text-sm text-[#9ca3af] px-4 py-2.5">
                            ${s.openingStraddle.toFixed(2)}
                          </td>
                          <td className="font-mono text-sm text-[#9ca3af] px-4 py-2.5">
                            {s.realizedMovePts.toFixed(1)}pts
                          </td>
                          <td className="font-mono text-sm text-[#9ca3af] px-4 py-2.5">
                            {s.maxMovePts.toFixed(1)}pts
                          </td>
                          <td
                            className="font-mono text-sm px-4 py-2.5"
                            style={{ color: ratioColor }}
                          >
                            {s.realizedMovePct.toFixed(1)}%
                          </td>
                          <td className="font-mono text-sm text-[#9ca3af] px-4 py-2.5">
                            {s.openingSkew?.toFixed(3) ?? "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
