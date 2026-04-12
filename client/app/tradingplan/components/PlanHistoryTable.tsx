"use client";

import { useState } from "react";
import { TradingPlan, ConditionEntry } from "../TradingPlanDashboard";

type Props = { plans: TradingPlan[] };

const TYPE_COLORS: Record<string, string> = {
  CONFIRM: "#4ade80",
  REGIME_BREAK: "#f87171",
  TRADE: "#f59e0b",
  NOTE: "#555",
};

const TYPE_LABELS: Record<string, string> = {
  CONFIRM: "CONFIRM",
  REGIME_BREAK: "REGIME BREAK",
  TRADE: "TRADE",
  NOTE: "NOTE",
};

const BIAS_COLORS: Record<string, string> = {
  "TRENDING (high-conf)": "#f87171",
  "TRENDING (low-conf)": "#f59e0b",
  "UNCLEAR": "#555",
  "REVERTING (low-conf)": "#60a5fa",
  "REVERTING (high-conf)": "#9CA9FF",
};

function formatTS(ts: string): string {
  return new Date(ts).toLocaleTimeString("en-US", {
    timeZone: "America/Chicago",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function RatingDots({ rating }: { rating: number | null }) {
  if (!rating) return <span className="text-[#333]">—</span>;
  return (
    <span className="flex gap-0.5">
      {[1,2,3,4,5].map(i => (
        <span
          key={i}
          className="w-1.5 h-1.5 rounded-full inline-block"
          style={{ backgroundColor: i <= rating ? "#9ca3af" : "#222" }}
        />
      ))}
    </span>
  );
}

export default function PlanHistoryTable({ plans }: Props) {
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="w-0.5 h-4 bg-[#333]" />
        <span className="font-sans text-xs text-[#666] uppercase tracking-wide">
          Histórico de planos
        </span>
      </div>

      <div className="bg-[#111] rounded overflow-hidden">
        {/* Table header */}
        <div className="grid grid-cols-[100px_1fr_1fr_80px_80px_60px] gap-2 px-4 py-2 border-b border-[#1a1a1a]">
          {["Data", "Bias", "Real", "Correto", "Trade", "Rating"].map(h => (
            <div key={h} className="font-sans text-[11px] text-[#555] uppercase tracking-wide">{h}</div>
          ))}
        </div>

        {plans.map(plan => {
          const isExpanded = expanded === plan.date;
          const biasColor = plan.regime_bias ? (BIAS_COLORS[plan.regime_bias] ?? "#555") : "#444";

          return (
            <div key={plan.date} className="border-b border-[#1a1a1a] last:border-0">
              {/* Summary row */}
              <div
                className="grid grid-cols-[100px_1fr_1fr_80px_80px_60px] gap-2 px-4 py-2.5 hover:bg-[#151515] transition-colors cursor-pointer items-center"
                onClick={() => setExpanded(isExpanded ? null : plan.date)}
              >
                <span className="font-mono text-xs text-[#9ca3af]">{plan.date}</span>
                <span className="font-mono text-xs truncate" style={{ color: biasColor }}>
                  {plan.regime_bias ?? "—"}
                </span>
                <span className="font-sans text-xs text-[#666] capitalize">
                  {plan.actual_regime ?? "—"}
                </span>
                <span className="font-mono text-xs" style={{
                  color: plan.bias_was_correct === true ? "#4ade80"
                    : plan.bias_was_correct === false ? "#f87171" : "#444"
                }}>
                  {plan.bias_was_correct === true ? "Sim"
                    : plan.bias_was_correct === false ? "Não" : "—"}
                </span>
                <span className="font-mono text-xs text-[#9ca3af] truncate">
                  {plan.trade_outcome ?? "—"}
                </span>
                <RatingDots rating={plan.accuracy_rating} />
              </div>

              {/* Expanded detail */}
              {isExpanded && (
                <div className="px-4 pb-4 space-y-4 bg-[#0d0d0d]">
                  {/* Metrics */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-3">
                    {[
                      ["Skew", plan.skew_value ? `${plan.skew_value.toFixed(3)} (${plan.skew_pctile}th)` : "—"],
                      ["VIX1D/VIX", plan.vix1d_vix_ratio?.toFixed(2) ?? "—"],
                      ["Straddle", plan.opening_straddle ? `$${plan.opening_straddle.toFixed(2)}` : "—"],
                      ["Score", plan.regime_score !== null ? (plan.regime_score > 0 ? `+${plan.regime_score}` : String(plan.regime_score)) : "—"],
                    ].map(([label, value]) => (
                      <div key={label}>
                        <div className="font-sans text-[10px] text-[#444] uppercase mb-0.5">{label}</div>
                        <div className="font-mono text-xs text-[#9ca3af]">{value}</div>
                      </div>
                    ))}
                  </div>

                  {/* VS3D context */}
                  {(plan.balance_strikes || plan.test_strikes || plan.vs3d_context) && (
                    <div className="space-y-1.5">
                      {plan.gamma_regime && (
                        <div className="flex gap-2 text-xs">
                          <span className="text-[#444] w-24 shrink-0">Gamma</span>
                          <span className="text-[#9ca3af]">{plan.gamma_regime}</span>
                        </div>
                      )}
                      {plan.balance_strikes && (
                        <div className="flex gap-2 text-xs">
                          <span className="text-[#444] w-24 shrink-0">Balance</span>
                          <span className="font-mono text-[#9ca3af]">{plan.balance_strikes}</span>
                        </div>
                      )}
                      {plan.test_strikes && (
                        <div className="flex gap-2 text-xs">
                          <span className="text-[#444] w-24 shrink-0">Test</span>
                          <span className="font-mono text-[#9ca3af]">{plan.test_strikes}</span>
                        </div>
                      )}
                      {plan.vs3d_context && (
                        <div className="flex gap-2 text-xs">
                          <span className="text-[#444] w-24 shrink-0">Contexto</span>
                          <span className="text-[#9ca3af]">{plan.vs3d_context}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Condition log */}
                  {plan.condition_log && plan.condition_log.length > 0 && (
                    <div className="space-y-1">
                      <div className="font-sans text-[10px] text-[#444] uppercase mb-1.5">Log</div>
                      {(plan.condition_log as ConditionEntry[]).map((entry, i) => (
                        <div key={i} className="flex gap-3 text-xs">
                          <span className="font-mono text-[#444] shrink-0">{formatTS(entry.ts)}</span>
                          <span className="font-mono shrink-0 w-24" style={{ color: TYPE_COLORS[entry.type] ?? "#555" }}>
                            {TYPE_LABELS[entry.type]}
                          </span>
                          <span className="text-[#9ca3af]">{entry.note}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Post session */}
                  {(plan.levels_held || plan.lesson) && (
                    <div className="space-y-1.5 border-t border-[#1a1a1a] pt-3">
                      {plan.levels_held && (
                        <div className="flex gap-2 text-xs">
                          <span className="text-[#444] w-24 shrink-0">Níveis</span>
                          <span className="text-[#9ca3af]">{plan.levels_held}</span>
                        </div>
                      )}
                      {plan.regime_confirmed_at && (
                        <div className="flex gap-2 text-xs">
                          <span className="text-[#444] w-24 shrink-0">Confirmado</span>
                          <span className="font-mono text-[#9ca3af]">{plan.regime_confirmed_at} CT</span>
                        </div>
                      )}
                      {plan.lesson && (
                        <div className="flex gap-2 text-xs">
                          <span className="text-[#444] w-24 shrink-0">Lição</span>
                          <span className="text-[#9ca3af]">{plan.lesson}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
