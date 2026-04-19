"use client";

import { useState, useEffect } from "react";
import { TradingPlan, SkewTrend } from "../TradingPlanDashboard";
import { THEME, withOpacity } from "../../lib/theme";

type Props = {
  plan: TradingPlan | null;
  latestSkew: {
    skew: number;
    put_iv: number;
    call_iv: number;
    atm_iv: number;
  } | null;
  skewPctile: number | null;
  skewTrend: SkewTrend;
  latestStraddle: {
    straddle_mid: number;
    spx_ref: number;
    atm_strike: number;
  } | null;
  weeklyImpliedMove: number | null;
  spxVsWeeklyAtm: number | null;
  overnightRangePts: number | null;
  overnightRangeClass: "tight" | "normal" | "wide" | null;
  onSave: (updates: Partial<TradingPlan>) => Promise<void>;
};

// Bias colors reference CSS vars via THEME — globals.css changes propagate live.
const BIAS_COLORS: Record<string, string> = {
  "TRENDING (high-conf)": THEME.amber,
  "TRENDING (low-conf)": withOpacity(THEME.amber, 0.6),
  UNCLEAR: THEME.text4,
  "REVERTING (low-conf)": withOpacity(THEME.indigo, 0.6),
  "REVERTING (high-conf)": THEME.indigo,
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
  UNCLEAR: [
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

const TREND_LABELS: Record<string, { label: string; color: string }> = {
  expanding: { label: "↑ expandindo", color: THEME.amber },
  compressing: { label: "↓ comprimindo", color: THEME.indigo },
  flat: { label: "→ estável", color: THEME.text4 },
};

const RANGE_COLORS: Record<string, string> = {
  tight: THEME.amber,
  normal: THEME.text3,
  wide: THEME.indigo,
};

function ScoreRow({ label, value }: { label: string; value: number }) {
  const color = value > 0 ? THEME.amber : value < 0 ? THEME.indigo : THEME.text5;
  const text =
    value > 0
      ? `+${value} trending`
      : value < 0
        ? `${value} reverting`
        : "neutral";
  return (
    <div className="flex justify-between items-center py-1 border-b border-border last:border-0">
      <span className="font-sans text-xs text-text-4">{label}</span>
      <span className="font-mono text-xs" style={{ color }}>
        {text}
      </span>
    </div>
  );
}

export default function PreMarketSection({
  plan,
  latestSkew,
  skewPctile,
  skewTrend,
  latestStraddle,
  weeklyImpliedMove,
  spxVsWeeklyAtm,
  overnightRangePts,
  overnightRangeClass,
  onSave,
}: Props) {
  const [gammaRegime, setGammaRegime] = useState(plan?.gamma_regime ?? "");
  const [balanceStrikes, setBalanceStrikes] = useState(
    plan?.balance_strikes ?? "",
  );
  const [testStrikes, setTestStrikes] = useState(plan?.test_strikes ?? "");
  const [vs3dContext, setVs3dContext] = useState(plan?.vs3d_context ?? "");
  const [overnightRange, setOvernightRange] = useState(
    plan?.overnight_es_range ?? overnightRangeClass ?? "",
  );
  const [planId, setPlanId] = useState(plan?.id ?? null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if ((plan?.id ?? null) === planId) return;
    setPlanId(plan?.id ?? null);
    setGammaRegime(plan?.gamma_regime ?? "");
    setBalanceStrikes(plan?.balance_strikes ?? "");
    setTestStrikes(plan?.test_strikes ?? "");
    setVs3dContext(plan?.vs3d_context ?? "");
    setOvernightRange(plan?.overnight_es_range ?? overnightRangeClass ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan?.id]);

  const bias = plan?.regime_bias ?? null;
  const score = plan?.regime_score ?? null;
  const breakdown = plan?.score_breakdown ?? null;
  const biasColor = bias ? (BIAS_COLORS[bias] ?? THEME.text4) : THEME.text4;
  const actionRules = bias ? (ACTION_RULES[bias] ?? []) : [];

  const trendInfo = TREND_LABELS[skewTrend.direction];
  const trendSessionsStr = skewTrend.sessions
    .map((s) => s.closingSkew.toFixed(3))
    .join(" → ");

  const ratioAboveAvg =
    skewTrend.skewAtmRatio !== null && skewTrend.skewAtmRatioAvg !== null
      ? skewTrend.skewAtmRatio > skewTrend.skewAtmRatioAvg
      : null;

  const isAutoRange =
    overnightRangeClass !== null &&
    plan?.overnight_es_range === overnightRangeClass;

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

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="w-0.5 h-4 bg-border-2" />
        <span className="font-sans text-xs text-text-3 uppercase tracking-wide">
          Pré-Mercado
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-panel rounded p-4 space-y-2">
          <div className="font-sans text-[11px] text-text-4 uppercase tracking-wide mb-3">
            Dados automáticos
          </div>

          <div className="flex justify-between items-center border-b border-border pb-1.5">
            <span className="font-sans text-xs text-text-4">Skew</span>
            <span className="font-mono text-xs text-text-2">
              {latestSkew
                ? `${latestSkew.skew.toFixed(3)} (${skewPctile ?? "—"}th %ile)`
                : "—"}
            </span>
          </div>

          <div className="flex justify-between items-start border-b border-border pb-1.5">
            <span className="font-sans text-xs text-text-4">
              Skew trend (3 sess.)
            </span>
            <div className="text-right">
              <div
                className="font-mono text-xs"
                style={{ color: trendInfo.color }}
              >
                {trendInfo.label}
              </div>
              {trendSessionsStr && (
                <div className="font-mono text-[10px] text-text-5">
                  {trendSessionsStr}
                </div>
              )}
            </div>
          </div>

          <div className="flex justify-between items-center border-b border-border pb-1.5">
            <span className="font-sans text-xs text-text-4">Skew / ATM IV</span>
            <span
              className="font-mono text-xs"
              style={{
                color:
                  ratioAboveAvg === null
                    ? THEME.text2
                    : ratioAboveAvg
                      ? THEME.amber
                      : THEME.indigo,
              }}
            >
              {skewTrend.skewAtmRatio !== null
                ? skewTrend.skewAtmRatio.toFixed(3)
                : "—"}
              {skewTrend.skewAtmRatioAvg !== null && (
                <span className="text-text-5 ml-1">
                  / avg {skewTrend.skewAtmRatioAvg.toFixed(3)}
                </span>
              )}
            </span>
          </div>

          <div className="flex justify-between items-center border-b border-border pb-1.5">
            <span className="font-sans text-xs text-text-4">ON ES range</span>
            <div className="flex items-center gap-2">
              {overnightRangePts !== null && (
                <span className="font-mono text-[10px] text-text-5">
                  {overnightRangePts.toFixed(1)}pts
                </span>
              )}
              {overnightRangeClass !== null ? (
                <span
                  className="font-mono text-xs"
                  style={{ color: RANGE_COLORS[overnightRangeClass] }}
                >
                  {overnightRangeClass}
                  {isAutoRange && (
                    <span className="text-text-5 ml-1 text-[10px]">auto</span>
                  )}
                </span>
              ) : (
                <span className="font-mono text-xs text-text-5">—</span>
              )}
            </div>
          </div>

          {[
            ["VIX1D/VIX", plan?.vix1d_vix_ratio?.toFixed(2) ?? "—"],
            [
              "Straddle abertura",
              latestStraddle
                ? `$${latestStraddle.straddle_mid.toFixed(2)}`
                : "—",
            ],
            [
              "Implied semanal",
              weeklyImpliedMove ? `$${weeklyImpliedMove.toFixed(2)}` : "—",
            ],
            [
              "SPX vs ATM semanal",
              spxVsWeeklyAtm !== null
                ? `${spxVsWeeklyAtm > 0 ? "+" : ""}${spxVsWeeklyAtm}pts`
                : "—",
            ],
            [
              "Macro hoje",
              plan?.has_macro ? (plan.macro_events ?? "Sim") : "Não",
            ],
          ].map(([label, value]) => (
            <div
              key={label}
              className="flex justify-between items-center border-b border-border pb-1.5 last:border-0 last:pb-0"
            >
              <span className="font-sans text-xs text-text-4">{label}</span>
              <span className="font-mono text-xs text-text-2">{value}</span>
            </div>
          ))}
        </div>

        <div className="bg-panel rounded p-4 space-y-3">
          <div className="font-sans text-[11px] text-text-4 uppercase tracking-wide mb-3">
            VS3D / Manual
          </div>

          <div>
            <div className="font-sans text-[11px] text-text-4 mb-1.5">
              Gamma regime
            </div>
            <div className="flex gap-2">
              {["positive", "negative", "mixed"].map((v) => (
                <button
                  key={v}
                  onClick={() => setGammaRegime(v)}
                  className={`font-mono text-xs px-2.5 py-1 rounded transition-colors hover:cursor-pointer ${
                    gammaRegime === v
                      ? "bg-border-2 text-text-2"
                      : "bg-transparent text-text-5 border border-border"
                  }`}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <div className="font-sans text-[11px] text-text-4">
                Overnight ES range
              </div>
              {overnightRangeClass && (
                <span className="font-sans text-[10px] text-text-5">
                  (auto: {overnightRangeClass} · override abaixo)
                </span>
              )}
            </div>
            <div className="flex gap-2">
              {["tight", "normal", "wide"].map((v) => (
                <button
                  key={v}
                  onClick={() => setOvernightRange(v)}
                  className={`font-mono text-xs px-2.5 py-1 rounded transition-colors hover:cursor-pointer ${
                    overnightRange === v
                      ? "bg-border-2 text-text-2"
                      : "bg-transparent text-text-5 border border-border"
                  }`}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="font-sans text-[11px] text-text-4 mb-1.5">
              Balance strikes (dealer long)
            </div>
            <input
              type="text"
              value={balanceStrikes}
              onChange={(e) => setBalanceStrikes(e.target.value)}
              placeholder="ex: 6820, 6800"
              className="w-full bg-page border border-border rounded px-2.5 py-1.5 font-mono text-xs text-text-2 placeholder-text-6 focus:border-text-5 focus:outline-none"
            />
          </div>

          <div>
            <div className="font-sans text-[11px] text-text-4 mb-1.5">
              Test strikes (dealer short)
            </div>
            <input
              type="text"
              value={testStrikes}
              onChange={(e) => setTestStrikes(e.target.value)}
              placeholder="ex: 6850↑, 6780↓"
              className="w-full bg-page border border-border rounded px-2.5 py-1.5 font-mono text-xs text-text-2 placeholder-text-6 focus:border-text-5 focus:outline-none"
            />
          </div>

          <div>
            <div className="font-sans text-[11px] text-text-4 mb-1.5">
              Contexto VS3D
            </div>
            <textarea
              value={vs3dContext}
              onChange={(e) => setVs3dContext(e.target.value)}
              placeholder="Uma frase sobre o posicionamento do dia..."
              rows={2}
              className="w-full bg-page border border-border rounded px-2.5 py-1.5 font-mono text-xs text-text-2 placeholder-text-6 focus:border-text-5 focus:outline-none resize-none"
            />
          </div>

          <button
            onClick={handleSave}
            disabled={isSaving}
            className="w-full bg-border-2 text-xs text-text-2 py-1.5 rounded hover:bg-border-2 hover:text-text transition-colors disabled:opacity-50 hover:cursor-pointer"
          >
            {isSaving ? "Salvando..." : "Salvar plano"}
          </button>
        </div>
      </div>

      {bias && breakdown && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-panel rounded p-4">
            <div className="font-sans text-[11px] text-text-4 uppercase tracking-wide mb-3">
              Score breakdown
            </div>
            <ScoreRow
              label="Gamma regime (2pts)"
              value={breakdown.gamma ?? 0}
            />
            <ScoreRow
              label="Skew percentile (1pt)"
              value={breakdown.skew ?? 0}
            />
            <ScoreRow
              label="VIX1D/VIX (1pt)"
              value={breakdown.vix_ratio ?? 0}
            />
            <ScoreRow
              label="Overnight ES range (1pt)"
              value={breakdown.overnight ?? 0}
            />
            <ScoreRow
              label="Balance at price (1pt)"
              value={breakdown.balance ?? 0}
            />
            <div className="flex justify-between items-center pt-2 mt-1 border-t border-border-2">
              <span className="font-sans text-xs text-text-3">Total</span>
              <span className="font-mono text-sm" style={{ color: biasColor }}>
                {score !== null && score > 0 ? `+${score}` : score}
              </span>
            </div>
          </div>

          <div className="bg-panel rounded p-4">
            <div className="font-sans text-[11px] text-text-4 uppercase tracking-wide mb-3">
              Regime
            </div>
            <div
              className="font-mono text-lg mb-4"
              style={{ color: biasColor }}
            >
              {bias}
            </div>
            {actionRules.length > 0 && (
              <div className="space-y-1.5">
                {actionRules.map((rule, i) => (
                  <div key={i} className="flex gap-2 text-xs text-text-3">
                    <span className="text-text-6 shrink-0">→</span>
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
