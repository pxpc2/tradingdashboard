"use client";

import { useState, useMemo } from "react";
import { signOut } from "../login/actions";
import { FaSignOutAlt } from "react-icons/fa";
import Link from "next/link";
import PreMarketSection from "./components/PreMarketSection";
import ConditionLog from "./components/ConditionLog";
import PostSessionReview from "./components/PostSessionReview";
import PlanHistoryTable from "./components/PlanHistoryTable";
import { supabase } from "../lib/supabase";

export type TradingPlan = {
  id: number;
  date: string;
  skew_value: number | null;
  skew_pctile: number | null;
  vix1d_vix_ratio: number | null;
  weekly_implied_move: number | null;
  spx_vs_weekly_atm: number | null;
  has_macro: boolean | null;
  macro_events: string | null;
  opening_straddle: number | null;
  gamma_regime: string | null;
  balance_strikes: string | null;
  test_strikes: string | null;
  vs3d_context: string | null;
  overnight_es_range: string | null;
  regime_score: number | null;
  regime_bias: string | null;
  score_breakdown: Record<string, number> | null;
  condition_log: ConditionEntry[];
  actual_regime: string | null;
  bias_was_correct: boolean | null;
  regime_confirmed_at: string | null;
  levels_held: string | null;
  trade_outcome: string | null;
  lesson: string | null;
  accuracy_rating: number | null;
  created_at: string;
  updated_at: string;
};

export type ConditionEntry = {
  ts: string;
  type: "CONFIRM" | "REGIME_BREAK" | "TRADE" | "NOTE";
  note: string;
};

type Props = {
  today: string;
  plans: TradingPlan[];
  latestSkew: { skew: number; put_iv: number; call_iv: number; atm_iv: number } | null;
  skewPctile: number | null;
  latestStraddle: { straddle_mid: number; spx_ref: number; atm_strike: number } | null;
  weeklyStraddle: { straddle_mid: number; atm_strike: number; spx_ref: number; expiry_date: string } | null;
};

function computeScore(plan: Partial<TradingPlan>, skewPctile: number | null): {
  score: number;
  bias: string;
  breakdown: Record<string, number>;
} {
  const breakdown: Record<string, number> = {};
  let score = 0;

  // Gamma regime (2pts)
  if (plan.gamma_regime === "negative") { breakdown.gamma = 2; score += 2; }
  else if (plan.gamma_regime === "positive") { breakdown.gamma = -2; score -= 2; }
  else { breakdown.gamma = 0; }

  // Skew percentile (1pt)
  const pctile = skewPctile ?? null;
  if (pctile !== null && pctile > 75) { breakdown.skew = 1; score += 1; }
  else if (pctile !== null && pctile < 25) { breakdown.skew = -1; score -= 1; }
  else { breakdown.skew = 0; }

  // VIX1D/VIX (1pt)
  const ratio = plan.vix1d_vix_ratio ?? null;
  if (ratio !== null && ratio > 1.1) { breakdown.vix_ratio = 1; score += 1; }
  else if (ratio !== null && ratio < 0.9) { breakdown.vix_ratio = -1; score -= 1; }
  else { breakdown.vix_ratio = 0; }

  // Overnight ES range (1pt) — manual
  if (plan.overnight_es_range === "wide") { breakdown.overnight = 1; score += 1; }
  else if (plan.overnight_es_range === "tight") { breakdown.overnight = -1; score -= 1; }
  else { breakdown.overnight = 0; }

  // Balance at price (1pt) — inferred from gamma regime + balance_strikes presence
  // If user says there's a balance strike at/near price → reverting
  // We use a simple heuristic: user fills balance_strikes = reverting signal
  if (plan.balance_strikes && plan.balance_strikes.trim().length > 0) {
    breakdown.balance = -1; score -= 1;
  } else {
    breakdown.balance = 0;
  }

  let bias = "UNCLEAR";
  if (score >= 4) bias = "TRENDING (high-conf)";
  else if (score >= 2) bias = "TRENDING (low-conf)";
  else if (score <= -4) bias = "REVERTING (high-conf)";
  else if (score <= -2) bias = "REVERTING (low-conf)";

  return { score, bias, breakdown };
}

export default function TradingPlanDashboard({
  today,
  plans,
  latestSkew,
  skewPctile,
  latestStraddle,
  weeklyStraddle,
}: Props) {
  const [localPlans, setLocalPlans] = useState<TradingPlan[]>(plans);

  const todayPlan = useMemo(
    () => localPlans.find(p => p.date === today) ?? null,
    [localPlans, today]
  );

  const historyPlans = useMemo(
    () => localPlans.filter(p => p.date !== today).slice(0, 50),
    [localPlans, today]
  );

  const weeklyImpliedMove = weeklyStraddle?.straddle_mid ?? null;
  const spxVsWeeklyAtm = latestStraddle && weeklyStraddle
    ? parseFloat((latestStraddle.spx_ref - weeklyStraddle.atm_strike).toFixed(2))
    : null;

  async function savePlan(updates: Partial<TradingPlan>) {
    const { score, bias, breakdown } = computeScore(
      { ...todayPlan, ...updates },
      skewPctile
    );

    const payload = {
      date: today,
      skew_value: latestSkew?.skew ?? null,
      skew_pctile: skewPctile,
      vix1d_vix_ratio: todayPlan?.vix1d_vix_ratio ?? null,
      weekly_implied_move: weeklyImpliedMove,
      spx_vs_weekly_atm: spxVsWeeklyAtm,
      opening_straddle: latestStraddle?.straddle_mid ?? null,
      regime_score: score,
      regime_bias: bias,
      score_breakdown: breakdown,
      ...updates,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from("trading_plans")
      .upsert(payload, { onConflict: "date" })
      .select()
      .single();

    if (!error && data) {
      setLocalPlans(prev => {
        const exists = prev.find(p => p.date === today);
        if (exists) return prev.map(p => p.date === today ? data as TradingPlan : p);
        return [data as TradingPlan, ...prev];
      });
    }
  }

  async function addConditionEntry(entry: ConditionEntry) {
    const existing = todayPlan?.condition_log ?? [];
    await savePlan({ condition_log: [...existing, entry] });
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      {/* Header */}
      <div className="border-b border-[#1a1a1a] bg-[#0a0a0a] sticky top-0 z-50">
        <div className="max-w-4xl mx-auto px-4 md:px-6 flex items-center justify-between h-10">
          <div className="flex items-center gap-4">
            <Link href="/" className="font-sans text-xs text-[#555] hover:text-[#f59e0b] transition-colors uppercase tracking-widest">
              ← Live
            </Link>
            <div className="w-px h-4 bg-[#1a1a1a]" />
            <span className="font-sans text-xs text-[#666] uppercase tracking-widest">
              Plano de Trading
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="font-mono text-xs text-[#444]">{today}</span>
            <div className="w-px h-4 bg-[#1a1a1a]" />
            <form action={signOut}>
              <button type="submit" className="font-sans text-xs text-[#555] hover:cursor-pointer">
                <FaSignOutAlt className="text-md hover:text-[#f59e0b]" />
              </button>
            </form>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 md:px-6 py-6 space-y-8">
        {/* Today's plan */}
        <PreMarketSection
          plan={todayPlan}
          latestSkew={latestSkew}
          skewPctile={skewPctile}
          latestStraddle={latestStraddle}
          weeklyImpliedMove={weeklyImpliedMove}
          spxVsWeeklyAtm={spxVsWeeklyAtm}
          onSave={savePlan}
        />

        <ConditionLog
          entries={todayPlan?.condition_log ?? []}
          onAdd={addConditionEntry}
        />

        <PostSessionReview
          plan={todayPlan}
          onSave={savePlan}
        />

        {/* History */}
        {historyPlans.length > 0 && (
          <PlanHistoryTable plans={historyPlans} />
        )}
      </div>
    </div>
  );
}
