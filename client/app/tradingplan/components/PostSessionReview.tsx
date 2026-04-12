"use client";

import { useState, useEffect } from "react";
import { TradingPlan } from "../TradingPlanDashboard";

type Props = {
  plan: TradingPlan | null;
  onSave: (updates: Partial<TradingPlan>) => Promise<void>;
};

export default function PostSessionReview({ plan, onSave }: Props) {
  const [actualRegime, setActualRegime] = useState(plan?.actual_regime ?? "");
  const [biasCorrect, setBiasCorrect] = useState<boolean | null>(plan?.bias_was_correct ?? null);
  const [confirmedAt, setConfirmedAt] = useState(plan?.regime_confirmed_at ?? "");
  const [levelsHeld, setLevelsHeld] = useState(plan?.levels_held ?? "");
  const [tradeOutcome, setTradeOutcome] = useState(plan?.trade_outcome ?? "");
  const [lesson, setLesson] = useState(plan?.lesson ?? "");
  const [rating, setRating] = useState(plan?.accuracy_rating ?? null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setActualRegime(plan?.actual_regime ?? "");
    setBiasCorrect(plan?.bias_was_correct ?? null);
    setConfirmedAt(plan?.regime_confirmed_at ?? "");
    setLevelsHeld(plan?.levels_held ?? "");
    setTradeOutcome(plan?.trade_outcome ?? "");
    setLesson(plan?.lesson ?? "");
    setRating(plan?.accuracy_rating ?? null);
  }, [plan]);

  async function handleSave() {
    setIsSaving(true);
    await onSave({
      actual_regime: actualRegime || null,
      bias_was_correct: biasCorrect,
      regime_confirmed_at: confirmedAt || null,
      levels_held: levelsHeld || null,
      trade_outcome: tradeOutcome || null,
      lesson: lesson || null,
      accuracy_rating: rating,
    });
    setIsSaving(false);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="w-0.5 h-4 bg-[#333]" />
        <span className="font-sans text-xs text-[#666] uppercase tracking-wide">
          Revisão pós-sessão
        </span>
      </div>

      <div className="bg-[#111] rounded p-4 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Actual regime */}
          <div>
            <div className="font-sans text-[11px] text-[#555] mb-1.5">Regime real do dia</div>
            <div className="flex gap-2">
              {["trending", "reverting", "mixed"].map(v => (
                <button
                  key={v}
                  onClick={() => setActualRegime(v)}
                  className={`font-mono text-xs px-2.5 py-1 rounded transition-colors hover:cursor-pointer ${
                    actualRegime === v
                      ? "bg-[#222] text-[#9ca3af]"
                      : "bg-transparent text-[#444] border border-[#222]"
                  }`}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>

          {/* Bias correct */}
          <div>
            <div className="font-sans text-[11px] text-[#555] mb-1.5">Bias estava correto?</div>
            <div className="flex gap-2">
              {([true, false] as const).map(v => (
                <button
                  key={String(v)}
                  onClick={() => setBiasCorrect(v)}
                  className={`font-mono text-xs px-2.5 py-1 rounded transition-colors hover:cursor-pointer ${
                    biasCorrect === v
                      ? "bg-[#222] text-[#9ca3af]"
                      : "bg-transparent text-[#444] border border-[#222]"
                  }`}
                >
                  {v ? "Sim" : "Não"}
                </button>
              ))}
            </div>
          </div>

          {/* Confirmed at */}
          <div>
            <div className="font-sans text-[11px] text-[#555] mb-1.5">Regime confirmado às (CT)</div>
            <input
              type="text"
              value={confirmedAt}
              onChange={e => setConfirmedAt(e.target.value)}
              placeholder="ex: 09:45"
              className="w-full bg-[#0a0a0a] border border-[#222] rounded px-2.5 py-1.5 font-mono text-xs text-[#9ca3af] placeholder-[#333] focus:border-[#444] focus:outline-none"
            />
          </div>

          {/* Rating */}
          <div>
            <div className="font-sans text-[11px] text-[#555] mb-1.5">Precisão do plano (1-5)</div>
            <div className="flex gap-2">
              {[1, 2, 3, 4, 5].map(v => (
                <button
                  key={v}
                  onClick={() => setRating(v)}
                  className={`font-mono text-xs w-8 py-1 rounded transition-colors hover:cursor-pointer ${
                    rating === v
                      ? "bg-[#222] text-[#9ca3af]"
                      : "bg-transparent text-[#444] border border-[#222]"
                  }`}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Levels held */}
        <div>
          <div className="font-sans text-[11px] text-[#555] mb-1.5">Níveis que seguraram / falharam</div>
          <input
            type="text"
            value={levelsHeld}
            onChange={e => setLevelsHeld(e.target.value)}
            placeholder="ex: 6820 balance segurou, 6850 test falhou"
            className="w-full bg-[#0a0a0a] border border-[#222] rounded px-2.5 py-1.5 font-mono text-xs text-[#9ca3af] placeholder-[#333] focus:border-[#444] focus:outline-none"
          />
        </div>

        {/* Trade outcome */}
        <div>
          <div className="font-sans text-[11px] text-[#555] mb-1.5">Resultado do trade</div>
          <input
            type="text"
            value={tradeOutcome}
            onChange={e => setTradeOutcome(e.target.value)}
            placeholder="ex: +$150, ou sem trade hoje"
            className="w-full bg-[#0a0a0a] border border-[#222] rounded px-2.5 py-1.5 font-mono text-xs text-[#9ca3af] placeholder-[#333] focus:border-[#444] focus:outline-none"
          />
        </div>

        {/* Lesson */}
        <div>
          <div className="font-sans text-[11px] text-[#555] mb-1.5">Lição do dia</div>
          <textarea
            value={lesson}
            onChange={e => setLesson(e.target.value)}
            placeholder="O que aprendeu hoje?"
            rows={2}
            className="w-full bg-[#0a0a0a] border border-[#222] rounded px-2.5 py-1.5 font-mono text-xs text-[#9ca3af] placeholder-[#333] focus:border-[#444] focus:outline-none resize-none"
          />
        </div>

        <button
          onClick={handleSave}
          disabled={isSaving}
          className="w-full bg-[#222] text-xs text-[#9ca3af] py-1.5 rounded hover:bg-[#2a2a2a] transition-colors disabled:opacity-50 hover:cursor-pointer"
        >
          {isSaving ? "Salvando..." : "Salvar revisão"}
        </button>
      </div>
    </div>
  );
}
