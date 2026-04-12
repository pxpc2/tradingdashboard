"use client";

import { useState, useEffect } from "react";
import { TradingPlan } from "../TradingPlanDashboard";

type Props = {
  plan: TradingPlan | null;
  latestSkew: { skew: number; put_iv: number; call_iv: number; atm_iv: number } | null;
  skewPctile: number | null;
  latestStraddle: { straddle_mid: number; spx_ref: number; atm_strike: number } | null;
  weeklyImpliedMove: number | null;
  spxVsWeeklyAtm: number | null;
  onSave: (updates: Partial<TradingPlan>) => Promise<void>;
};

const BIAS_COLORS: Record<string, string> = {
  "TRENDING (high-conf)": "#f87171",
  "TRENDING (low-conf)": "#f59e0b",
  "UNCLEAR": "#555",
  "REVERTING (low-conf)": "#60a5fa",
  "REVERTING (high-conf)": "#9CA9FF",
};

const ACTION_RULES: Record<string, string[]> = {
  "TRENDING (high-conf)": [
    "Não faça fade do primeiro movimento",
    "Deixe winners correrem além do primeiro alvo",
    "Reduza posição em test strikes (podem falhar)",
    "Straddle pode não decair normalmente — vol pode reprecificar",
  ],
  "TRENDING (low-conf)": [
    "Sinal fraco — aguarde confirmação nos primeiros 20min",
    "Tamanho reduzido até o regime ficar claro",
    "Monitore se balance strikes estão segurando",
  ],
  "UNCLEAR": [
    "Aguarde 30-45min para o regime se revelar",
    "Tamanho mínimo ou fora do mercado",
    "Registre observações no log sem comprometer capital",
  ],
  "REVERTING (low-conf)": [
    "Sinal fraco — confirme antes de fazer fade",
    "Tamanho reduzido",
    "Saia se preço romper balance strike com convicção",
  ],
  "REVERTING (high-conf)": [
    "Fade moves em direção a test strikes agressivamente",
    "Realize lucro em balance strikes",
    "Straddle deve decair conforme a curva média ou mais rápido",
    "Reduza se preço romper balance strike de forma limpa",
  ],
};

function ScoreRow({ label, value }: { label: string; value: number }) {
  const color = value > 0 ? "#f87171" : value < 0 ? "#9CA9FF" : "#444";
  const text = value > 0 ? `+${value} trending` : value < 0 ? `${value} reverting` : "neutral";
  return (
    <div className="flex justify-between items-center py-1 border-b border-[#1a1a1a] last:border-0">
      <span className="font-sans text-xs text-[#555]">{label}</span>
      <span className="font-mono text-xs" style={{ color }}>{text}</span>
    </div>
  );
}

export default function PreMarketSection({
  plan, latestSkew, skewPctile, latestStraddle,
  weeklyImpliedMove, spxVsWeeklyAtm, onSave,
}: Props) {
  const [gammaRegime, setGammaRegime] = useState(plan?.gamma_regime ?? "");
  const [balanceStrikes, setBalanceStrikes] = useState(plan?.balance_strikes ?? "");
  const [testStrikes, setTestStrikes] = useState(plan?.test_strikes ?? "");
  const [vs3dContext, setVs3dContext] = useState(plan?.vs3d_context ?? "");
  const [overnightRange, setOvernightRange] = useState(plan?.overnight_es_range ?? "");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setGammaRegime(plan?.gamma_regime ?? "");
    setBalanceStrikes(plan?.balance_strikes ?? "");
    setTestStrikes(plan?.test_strikes ?? "");
    setVs3dContext(plan?.vs3d_context ?? "");
    setOvernightRange(plan?.overnight_es_range ?? "");
  }, [plan]);

  const bias = plan?.regime_bias ?? null;
  const score = plan?.regime_score ?? null;
  const breakdown = plan?.score_breakdown ?? null;

  async function handleSave() {
    setIsSaving(true);
    await onSave({
      gamma_regime: gammaRegime || null,
      balance_strikes: balanceStrikes || null,
      test_strikes: testStrikes || null,
      vs3d_context: vs3dContext || null,
      overnight_es_range: overnightRange || null,
    });
    setIsSaving(false);
  }

  const biasColor = bias ? (BIAS_COLORS[bias] ?? "#555") : "#555";
  const actionRules = bias ? (ACTION_RULES[bias] ?? []) : [];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="w-0.5 h-4 bg-[#333]" />
        <span className="font-sans text-xs text-[#666] uppercase tracking-wide">
          Pré-Mercado
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Auto-populated metrics */}
        <div className="bg-[#111] rounded p-4 space-y-2">
          <div className="font-sans text-[11px] text-[#555] uppercase tracking-wide mb-3">
            Dados automáticos
          </div>

          {[
            ["Skew", latestSkew ? `${latestSkew.skew.toFixed(3)} (${skewPctile ?? "—"}th %ile)` : "—"],
            ["VIX1D/VIX", plan?.vix1d_vix_ratio?.toFixed(2) ?? "—"],
            ["Straddle abertura", latestStraddle ? `$${latestStraddle.straddle_mid.toFixed(2)}` : "—"],
            ["Implied semanal", weeklyImpliedMove ? `$${weeklyImpliedMove.toFixed(2)}` : "—"],
            ["SPX vs ATM semanal", spxVsWeeklyAtm !== null ? `${spxVsWeeklyAtm > 0 ? "+" : ""}${spxVsWeeklyAtm}pts` : "—"],
            ["Macro hoje", plan?.has_macro ? (plan.macro_events ?? "Sim") : "Não"],
          ].map(([label, value]) => (
            <div key={label} className="flex justify-between items-center border-b border-[#1a1a1a] pb-1.5 last:border-0 last:pb-0">
              <span className="font-sans text-xs text-[#555]">{label}</span>
              <span className="font-mono text-xs text-[#9ca3af]">{value}</span>
            </div>
          ))}
        </div>

        {/* VS3D inputs */}
        <div className="bg-[#111] rounded p-4 space-y-3">
          <div className="font-sans text-[11px] text-[#555] uppercase tracking-wide mb-3">
            VS3D / Manual
          </div>

          {/* Gamma regime */}
          <div>
            <div className="font-sans text-[11px] text-[#555] mb-1.5">Gamma regime</div>
            <div className="flex gap-2">
              {["positive", "negative", "mixed"].map(v => (
                <button
                  key={v}
                  onClick={() => setGammaRegime(v)}
                  className={`font-mono text-xs px-2.5 py-1 rounded transition-colors hover:cursor-pointer ${
                    gammaRegime === v
                      ? "bg-[#222] text-[#9ca3af]"
                      : "bg-transparent text-[#444] border border-[#222]"
                  }`}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>

          {/* Overnight ES range */}
          <div>
            <div className="font-sans text-[11px] text-[#555] mb-1.5">Overnight ES range</div>
            <div className="flex gap-2">
              {["tight", "normal", "wide"].map(v => (
                <button
                  key={v}
                  onClick={() => setOvernightRange(v)}
                  className={`font-mono text-xs px-2.5 py-1 rounded transition-colors hover:cursor-pointer ${
                    overnightRange === v
                      ? "bg-[#222] text-[#9ca3af]"
                      : "bg-transparent text-[#444] border border-[#222]"
                  }`}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>

          {/* Balance strikes */}
          <div>
            <div className="font-sans text-[11px] text-[#555] mb-1.5">Balance strikes (dealer long)</div>
            <input
              type="text"
              value={balanceStrikes}
              onChange={e => setBalanceStrikes(e.target.value)}
              placeholder="ex: 6820, 6800"
              className="w-full bg-[#0a0a0a] border border-[#222] rounded px-2.5 py-1.5 font-mono text-xs text-[#9ca3af] placeholder-[#333] focus:border-[#444] focus:outline-none"
            />
          </div>

          {/* Test strikes */}
          <div>
            <div className="font-sans text-[11px] text-[#555] mb-1.5">Test strikes (dealer short)</div>
            <input
              type="text"
              value={testStrikes}
              onChange={e => setTestStrikes(e.target.value)}
              placeholder="ex: 6850↑, 6780↓"
              className="w-full bg-[#0a0a0a] border border-[#222] rounded px-2.5 py-1.5 font-mono text-xs text-[#9ca3af] placeholder-[#333] focus:border-[#444] focus:outline-none"
            />
          </div>

          {/* VS3D context */}
          <div>
            <div className="font-sans text-[11px] text-[#555] mb-1.5">Contexto VS3D</div>
            <textarea
              value={vs3dContext}
              onChange={e => setVs3dContext(e.target.value)}
              placeholder="Uma frase sobre o posicionamento do dia..."
              rows={2}
              className="w-full bg-[#0a0a0a] border border-[#222] rounded px-2.5 py-1.5 font-mono text-xs text-[#9ca3af] placeholder-[#333] focus:border-[#444] focus:outline-none resize-none"
            />
          </div>

          <button
            onClick={handleSave}
            disabled={isSaving}
            className="w-full bg-[#222] text-xs text-[#9ca3af] py-1.5 rounded hover:bg-[#2a2a2a] transition-colors disabled:opacity-50 hover:cursor-pointer"
          >
            {isSaving ? "Salvando..." : "Salvar plano"}
          </button>
        </div>
      </div>

      {/* Score breakdown + regime output */}
      {bias && breakdown && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Score breakdown */}
          <div className="bg-[#111] rounded p-4">
            <div className="font-sans text-[11px] text-[#555] uppercase tracking-wide mb-3">
              Score breakdown
            </div>
            <ScoreRow label="Gamma regime (2pts)" value={breakdown.gamma ?? 0} />
            <ScoreRow label="Skew percentile (1pt)" value={breakdown.skew ?? 0} />
            <ScoreRow label="VIX1D/VIX (1pt)" value={breakdown.vix_ratio ?? 0} />
            <ScoreRow label="Overnight ES range (1pt)" value={breakdown.overnight ?? 0} />
            <ScoreRow label="Balance at price (1pt)" value={breakdown.balance ?? 0} />
            <div className="flex justify-between items-center pt-2 mt-1 border-t border-[#222]">
              <span className="font-sans text-xs text-[#666]">Total</span>
              <span className="font-mono text-sm" style={{ color: biasColor }}>
                {score !== null && score > 0 ? `+${score}` : score}
              </span>
            </div>
          </div>

          {/* Regime output + action rules */}
          <div className="bg-[#111] rounded p-4">
            <div className="font-sans text-[11px] text-[#555] uppercase tracking-wide mb-3">
              Regime
            </div>
            <div className="font-mono text-lg mb-4" style={{ color: biasColor }}>
              {bias}
            </div>
            {actionRules.length > 0 && (
              <div className="space-y-1.5">
                {actionRules.map((rule, i) => (
                  <div key={i} className="flex gap-2 text-xs text-[#666]">
                    <span className="text-[#333] shrink-0">→</span>
                    <span>{rule}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
