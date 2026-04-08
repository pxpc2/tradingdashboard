"use client";

import { useState } from "react";

type Props = {
  initialBasis: number | null;
  compact?: boolean;
};

export default function EsSpxConverter({
  initialBasis,
  compact = false,
}: Props) {
  const [mode, setMode] = useState<"spx-to-es" | "es-to-spx">("spx-to-es");
  const [inputValue, setInputValue] = useState<string>("");

  const basisNum = initialBasis ?? 0;
  const inputNum = parseFloat(inputValue) || 0;

  const outputNum =
    inputNum === 0
      ? null
      : mode === "spx-to-es"
        ? inputNum + basisNum
        : inputNum - basisNum;

  function toggle() {
    if (outputNum !== null) {
      setInputValue(outputNum.toFixed(2));
    }
    setMode((m) => (m === "spx-to-es" ? "es-to-spx" : "spx-to-es"));
  }

  const fromLabel = mode === "spx-to-es" ? "SPX" : "ES";
  const toLabel = mode === "spx-to-es" ? "ES" : "SPX";
  const outputColor = mode === "spx-to-es" ? "#9CA9FF" : "#34d399";

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        {initialBasis !== null && (
          <span className="font-mono text-[10px] text-[#2a2a2a]">
            Basis {initialBasis.toFixed(2)}
          </span>
        )}
        <div className="w-px h-4 bg-[#1a1a1a]" />
        <span className="font-sans text-[10px] text-[#333] uppercase tracking-widest">
          {fromLabel}
        </span>
        <input
          type="number"
          step="5"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder="—"
          className="font-mono w-20 bg-transparent text-xs text-[#666] outline-none text-right border-b border-[#1f1f1f] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        />
        <button
          onClick={toggle}
          className="text-[#333] hover:text-[#555] transition-colors text-sm leading-none hover:cursor-pointer select-none"
        >
          ⇄
        </button>
        <span className="font-sans text-[10px] text-[#333] uppercase tracking-widest">
          {toLabel}
        </span>
        <span
          className="font-mono text-xs w-20 text-left"
          style={{ color: outputNum !== null ? outputColor : "#333" }}
        >
          {outputNum !== null ? outputNum.toFixed(2) : "—"}
        </span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-4 py-2">
      <div className="flex items-center gap-2">
        <span className="text-xs text-[#333] uppercase tracking-wide">
          Basis
        </span>
        <span className="font-sans text-xs text-[#444]">ES = SPX +</span>
        <span className="font-mono text-sm text-[#555] w-16 text-right">
          {initialBasis !== null ? initialBasis.toFixed(2) : "—"}
        </span>
      </div>

      <div className="w-px h-4 bg-[#1f1f1f]" />

      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5">
          <span className="font-sans text-xs text-[#333] uppercase tracking-wide w-6">
            {fromLabel}
          </span>
          <input
            type="number"
            step="5"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="—"
            className="font-mono w-24 bg-[#111111] border border-[#1f1f1f] rounded-sm px-2 py-1 text-sm text-[#888] outline-none text-right [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          />
        </div>

        <button
          onClick={toggle}
          className="text-[#333] hover:text-[#666] transition-colors text-base leading-none hover:cursor-pointer select-none px-1"
        >
          ⇄
        </button>

        <div className="flex items-center gap-1.5">
          <span className="font-sans text-xs text-[#333] uppercase tracking-wide w-6">
            {toLabel}
          </span>
          <span
            className="font-mono w-24 text-sm text-right px-2 py-1"
            style={{ color: outputNum !== null ? outputColor : "#333" }}
          >
            {outputNum !== null ? outputNum.toFixed(2) : "—"}
          </span>
        </div>
      </div>
    </div>
  );
}
