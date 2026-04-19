"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { signOut } from "../login/actions";
import { FaSignOutAlt } from "react-icons/fa";
import ImpliedVsRealized from "./components/ImpliedVsRealized";
import RatioHistogram from "./components/RatioHistogram";
import DecayCurve from "./components/DecayCurve";
import StraddleHistory from "./components/StraddleHistory";
import DayOfWeekBreakdown from "./components/DayOfWeekBreakdown";
import MaxVsEod from "./components/MaxVsEod";
import SkewVsRealized from "./components/SkewVsRealized";
import OvernightRange from "./components/OvernightRange";
import WeeklyStraddle from "./components/WeeklyStraddle";
import VixVsRealized from "./components/VixVsRealized";
import { THEME } from "../lib/theme";

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

type EsSnapshot = {
  created_at: string;
  open: number;
  high: number;
  low: number;
  es_ref: number;
};

type SessionSummaryRow = {
  date: string;
  opening_vix: number | null;
  opening_vix1d: number | null;
  opening_vix1d_vix_ratio: number | null;
  has_high_impact_macro: boolean | null;
  spx_closed_above_open: boolean | null;
};

export type SessionData = {
  date: string;
  dayOfWeek: string;
  openingStraddle: number;
  openingSpx: number;
  openingSkew: number | null;
  closingSkew: number | null;
  skewChange: number | null;
  closingSpx: number;
  realizedMovePts: number;
  realizedMovePct: number;
  maxMovePts: number;
  maxMovePct: number;
  overnightRange: number | null;
  overnightGap: number | null;
  snapshots: StraddleSnapshot[];
  openingVix: number | null;
  openingVix1d: number | null;
  vix1dVixRatio: number | null;
  hasMacro: boolean | null;
  spxClosedAboveOpen: boolean | null;
};

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

type Filters = { vixRatio: "all" | "high" | "low" };

type Props = {
  straddleSnapshots: StraddleSnapshot[];
  skewSnapshots: SkewSnapshot[];
  esSnapshots: EsSnapshot[];
  weeklyStraddles: WeeklyStraddleRow[];
  currentSpx: number | null;
  sessionSummaries: SessionSummaryRow[];
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

function prevCalendarDay(etDate: string): string {
  const d = new Date(etDate + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

function SectionHeader({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <div className="w-0.5 h-4 bg-border-2" />
      <span className="font-sans text-xs text-text-3 uppercase tracking-wide">
        {label}
      </span>
    </div>
  );
}

function FilterPill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`font-mono text-xs px-2.5 py-1 rounded transition-colors hover:cursor-pointer ${
        active
          ? "bg-border-2 text-text-2"
          : "bg-transparent text-text-5 border border-border"
      }`}
    >
      {children}
    </button>
  );
}

export default function AnalysisDashboard({
  straddleSnapshots,
  skewSnapshots,
  esSnapshots,
  weeklyStraddles,
  currentSpx,
  sessionSummaries,
}: Props) {
  const [filters, setFilters] = useState<Filters>({ vixRatio: "all" });

  const summaryByDate = useMemo(() => {
    const map = new Map<string, SessionSummaryRow>();
    for (const s of sessionSummaries) map.set(s.date, s);
    return map;
  }, [sessionSummaries]);

  const sessions = useMemo((): SessionData[] => {
    const byDate = new Map<string, StraddleSnapshot[]>();
    for (const s of straddleSnapshots) {
      const date = getETDate(s.created_at);
      if (!byDate.has(date)) byDate.set(date, []);
      byDate.get(date)!.push(s);
    }

    const skewByDate = new Map<string, number>();
    const closingSkewByDate = new Map<string, number>();
    for (const s of skewSnapshots) {
      const date = getETDate(s.created_at);
      if (!skewByDate.has(date)) skewByDate.set(date, s.skew);
      closingSkewByDate.set(date, s.skew);
    }

    const overnightByDate = new Map<
      string,
      { range: number; gap: number | null }
    >();
    for (const [date] of byDate) {
      const prev = prevCalendarDay(date);
      const windowStart = new Date(`${prev}T21:00:00Z`).getTime();
      const windowEnd = new Date(`${date}T13:30:00Z`).getTime();

      const overnightBars = esSnapshots.filter((e) => {
        const t = new Date(e.created_at).getTime();
        return (
          t >= windowStart &&
          t < windowEnd &&
          e.high !== null &&
          e.low !== null &&
          e.high > 0 &&
          e.low > 0
        );
      });

      if (overnightBars.length < 5) continue;

      const overnightHigh = Math.max(...overnightBars.map((e) => e.high));
      const overnightLow = Math.min(...overnightBars.map((e) => e.low));
      const range = parseFloat((overnightHigh - overnightLow).toFixed(2));

      const priorBars = esSnapshots.filter((e) => {
        const t = new Date(e.created_at).getTime();
        return t >= new Date(`${prev}T13:30:00Z`).getTime() && t < windowStart;
      });
      const lastRTHClose =
        priorBars.length > 0 ? priorBars[priorBars.length - 1].es_ref : null;
      const firstGlobexOpen = overnightBars[0]?.open ?? null;
      const gap =
        lastRTHClose && firstGlobexOpen
          ? parseFloat((firstGlobexOpen - lastRTHClose).toFixed(2))
          : null;

      overnightByDate.set(date, { range, gap });
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
      const openingSkew = skewByDate.get(date) ?? null;
      const closingSkew = closingSkewByDate.get(date) ?? null;
      const skewChange =
        openingSkew !== null && closingSkew !== null
          ? parseFloat((closingSkew - openingSkew).toFixed(4))
          : null;
      const overnight = overnightByDate.get(date) ?? null;
      const summary = summaryByDate.get(date) ?? null;

      result.push({
        date,
        dayOfWeek: getDayOfWeek(date),
        openingStraddle: opening.straddle_mid,
        openingSpx: openSpx,
        openingSkew,
        closingSkew,
        skewChange,
        closingSpx: closeSpx,
        realizedMovePts,
        realizedMovePct,
        maxMovePts,
        maxMovePct,
        overnightRange: overnight?.range ?? null,
        overnightGap: overnight?.gap ?? null,
        snapshots: sorted,
        openingVix: summary?.opening_vix ?? null,
        openingVix1d: summary?.opening_vix1d ?? null,
        vix1dVixRatio: summary?.opening_vix1d_vix_ratio ?? null,
        hasMacro: summary?.has_high_impact_macro ?? null,
        spxClosedAboveOpen: summary?.spx_closed_above_open ?? null,
      });
    }

    return result.sort((a, b) => a.date.localeCompare(b.date));
  }, [straddleSnapshots, skewSnapshots, esSnapshots, summaryByDate]);

  const filteredSessions = useMemo(() => {
    return sessions.filter((s) => {
      if (
        filters.vixRatio === "high" &&
        (s.vix1dVixRatio === null || s.vix1dVixRatio <= 1.0)
      )
        return false;
      if (
        filters.vixRatio === "low" &&
        (s.vix1dVixRatio === null || s.vix1dVixRatio > 1.0)
      )
        return false;
      return true;
    });
  }, [sessions, filters]);

  const sessionCount = sessions.length;
  const filteredCount = filteredSessions.length;
  const isFiltered = filteredCount !== sessionCount;
  const hasVixData = sessions.some((s) => s.vix1dVixRatio !== null);

  return (
    <div className="min-h-screen bg-page">
      <div className="border-b border-border bg-page sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 md:px-6 flex items-center justify-between h-10">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="font-sans text-xs text-text-4 hover:text-amber transition-colors uppercase tracking-widest"
            >
              ← voltar p/ home
            </Link>
            <div className="w-px h-4 bg-border" />
          </div>
          <div className="flex items-center gap-3">
            <span className="font-mono text-xs text-text-5">
              {isFiltered ? (
                <>
                  <span className="text-text-2">{filteredCount}</span> /{" "}
                  {sessionCount} sessions
                </>
              ) : (
                <>
                  {sessionCount} session{sessionCount !== 1 ? "s" : ""}
                </>
              )}
            </span>
            <div className="w-px h-4 bg-border" />
            <form action={signOut}>
              <button type="submit" className="text-text-4 hover:cursor-pointer">
                <FaSignOutAlt className="text-md hover:text-amber" />
              </button>
            </form>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 space-y-8">
        {sessionCount < 2 ? (
          <div className="flex items-center justify-center h-64 text-xs text-text-5 uppercase tracking-wide">
            Not enough sessions yet — check back after a few trading days
          </div>
        ) : (
          <>
            {/* Filter panel */}
            <div className="bg-panel rounded p-3 flex flex-wrap items-center gap-3">
              <span className="font-sans text-[11px] text-text-4 uppercase tracking-wide">
                Filtros
              </span>
              <div className="w-px h-4 bg-border" />

              <div className="flex items-center gap-1.5">
                <span className="font-sans text-[11px] text-text-5">
                  VIX1D/VIX
                </span>
                <FilterPill
                  active={filters.vixRatio === "all"}
                  onClick={() => setFilters((f) => ({ ...f, vixRatio: "all" }))}
                >
                  todos
                </FilterPill>
                <FilterPill
                  active={filters.vixRatio === "high"}
                  onClick={() =>
                    setFilters((f) => ({ ...f, vixRatio: "high" }))
                  }
                >
                  &gt;1.0
                </FilterPill>
                <FilterPill
                  active={filters.vixRatio === "low"}
                  onClick={() => setFilters((f) => ({ ...f, vixRatio: "low" }))}
                >
                  ≤1.0
                </FilterPill>
              </div>

              {isFiltered && (
                <>
                  <div className="w-px h-4 bg-border" />
                  <button
                    onClick={() => setFilters({ vixRatio: "all" })}
                    className="font-sans text-[11px] text-amber hover:cursor-pointer"
                  >
                    limpar filtros
                  </button>
                </>
              )}
            </div>

            {filteredCount < 2 ? (
              <div className="flex items-center justify-center h-32 text-xs text-text-5 uppercase tracking-wide">
                Nenhuma sessão com esses filtros
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <SectionHeader label="Implied vs Realized" />
                    <ImpliedVsRealized sessions={filteredSessions} />
                  </div>
                  <div>
                    <SectionHeader label="Distribuição RV/IV" />
                    <RatioHistogram sessions={filteredSessions} />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <SectionHeader label="Straddle abertura histórico" />
                    <StraddleHistory sessions={filteredSessions} />
                  </div>
                  <div>
                    <SectionHeader label="RV/IV por dia da semana" />
                    <DayOfWeekBreakdown sessions={filteredSessions} />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <SectionHeader label="Max intraday vs EOD — classificação de sessão" />
                    <MaxVsEod sessions={filteredSessions} />
                  </div>
                  <div>
                    <SectionHeader label="Skew intraday vs regime do dia" />
                    <SkewVsRealized sessions={filteredSessions} />
                  </div>
                </div>

                {hasVixData && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <SectionHeader label="VIX1D/VIX vs RV/IV" />
                      <VixVsRealized sessions={filteredSessions} />
                    </div>
                    <div>
                      <SectionHeader label="Overnight ES range vs RV/IV" />
                      <OvernightRange sessions={filteredSessions} />
                    </div>
                  </div>
                )}

                {!hasVixData && (
                  <div>
                    <SectionHeader label="Overnight ES range vs RV/IV" />
                    <OvernightRange sessions={filteredSessions} />
                  </div>
                )}

                {weeklyStraddles.length > 0 && (
                  <div>
                    <SectionHeader label="Straddle semanal — range implícito" />
                    <WeeklyStraddle
                      weeklyStraddles={weeklyStraddles}
                      sessions={filteredSessions}
                      currentSpx={currentSpx}
                    />
                  </div>
                )}

                <div>
                  <SectionHeader label="Straddle Decay — média vs hoje" />
                  <DecayCurve
                    sessions={filteredSessions}
                    straddleSnapshots={straddleSnapshots}
                  />
                </div>

                {/* Session table */}
                <div>
                  <SectionHeader label="Tabela sessões" />
                  <div className="bg-panel rounded overflow-hidden overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-border">
                          {[
                            "Data",
                            "Dia",
                            "Implied",
                            "Realized",
                            "Max",
                            "RV/IV",
                            "Skew",
                            "Skew Δ",
                            "ON Range",
                            "VIX",
                            "VIX1D/VIX",
                          ].map((h) => (
                            <th
                              key={h}
                              className="font-sans text-[11px] text-text-4 uppercase tracking-wide text-left px-4 py-2.5 font-normal whitespace-nowrap"
                            >
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {[...filteredSessions].reverse().map((s) => {
                          const ratio = s.realizedMovePct / 100;
                          const ratioColor =
                            ratio >= 1
                              ? THEME.regime.trend
                              : ratio >= 0.7
                                ? THEME.regime.partial
                                : THEME.text2;
                          const vixRatioColor =
                            s.vix1dVixRatio === null
                              ? THEME.text5
                              : s.vix1dVixRatio > 1.1
                                ? THEME.amber
                                : s.vix1dVixRatio < 0.9
                                  ? THEME.indigo
                                  : THEME.text2;
                          const skewDeltaColor =
                            s.skewChange === null
                              ? THEME.text5
                              : s.skewChange > 0
                                ? THEME.amber
                                : s.skewChange < 0
                                  ? THEME.indigo
                                  : THEME.text4;
                          return (
                            <tr
                              key={s.date}
                              className="border-b border-border last:border-0 hover:bg-panel-2 transition-colors"
                            >
                              <td className="font-mono text-sm text-text-2 px-4 py-2.5">
                                {s.date}
                              </td>
                              <td className="font-sans text-sm text-text-3 px-4 py-2.5">
                                {s.dayOfWeek}
                              </td>
                              <td className="font-mono text-sm text-text-2 px-4 py-2.5">
                                ${s.openingStraddle.toFixed(2)}
                              </td>
                              <td className="font-mono text-sm text-text-2 px-4 py-2.5">
                                {s.realizedMovePts.toFixed(1)}pts
                              </td>
                              <td className="font-mono text-sm text-text-2 px-4 py-2.5">
                                {s.maxMovePts.toFixed(1)}pts
                              </td>
                              <td
                                className="font-mono text-sm px-4 py-2.5"
                                style={{ color: ratioColor }}
                              >
                                {s.realizedMovePct.toFixed(1)}%
                              </td>
                              <td className="font-mono text-sm text-text-2 px-4 py-2.5">
                                {s.openingSkew?.toFixed(3) ?? "—"}
                              </td>
                              <td
                                className="font-mono text-sm px-4 py-2.5"
                                style={{ color: skewDeltaColor }}
                              >
                                {s.skewChange !== null
                                  ? `${s.skewChange > 0 ? "+" : ""}${s.skewChange.toFixed(3)}`
                                  : "—"}
                              </td>
                              <td className="font-mono text-sm text-text-2 px-4 py-2.5">
                                {s.overnightRange !== null
                                  ? `${s.overnightRange.toFixed(1)}pts`
                                  : "—"}
                              </td>
                              <td className="font-mono text-sm text-text-2 px-4 py-2.5">
                                {s.openingVix?.toFixed(2) ?? "—"}
                              </td>
                              <td
                                className="font-mono text-sm px-4 py-2.5"
                                style={{ color: vixRatioColor }}
                              >
                                {s.vix1dVixRatio?.toFixed(2) ?? "—"}
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
          </>
        )}
      </div>
    </div>
  );
}
