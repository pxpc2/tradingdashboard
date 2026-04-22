"use client";

import { useMemo, useState } from "react";
import { THEME } from "../lib/theme";
import { useLiveTick, ES_STREAMER_SYMBOL } from "../hooks/useLiveTick";

// Stable reference — prevents useLiveTick from reconnecting on every render
const SYMBOLS = ["SPX", ES_STREAMER_SYMBOL];

type Props = {
  initialBasis: number | null;
};

export default function Converter({ initialBasis }: Props) {
  const [mode, setMode] = useState<"spx-to-es" | "es-to-spx">("spx-to-es");
  const [inputValue, setInputValue] = useState<string>("");

  const ticks = useLiveTick(SYMBOLS);

  const liveBasis = useMemo(() => {
    const spxMid = ticks["SPX"]?.mid;
    const esMid = ticks[ES_STREAMER_SYMBOL]?.mid;
    if (!spxMid || !esMid || spxMid === 0 || esMid === 0) return null;
    return esMid - spxMid;
  }, [ticks]);

  // Live basis once WebSocket connects, SSR value until then
  const basis = liveBasis ?? initialBasis;

  const basisNum = basis != null ? basis : 0;
  const inputNum = parseFloat(inputValue) || 0;
  const outputNum =
    inputNum === 0
      ? null
      : mode === "spx-to-es"
        ? inputNum + basisNum
        : inputNum - basisNum;

  function toggle() {
    if (outputNum !== null) setInputValue(outputNum.toFixed(2));
    setMode((m) => (m === "spx-to-es" ? "es-to-spx" : "spx-to-es"));
  }

  const fromLabel = mode === "spx-to-es" ? "SPX" : "ES";
  const toLabel = mode === "spx-to-es" ? "ES" : "SPX";
  const outputColor = mode === "spx-to-es" ? THEME.indigo : THEME.up;

  return (
    <div className="flex items-center gap-2 text-[10px]">
      {basis != null && (
        <>
          <span className="font-mono text-text-4">B-{basis.toFixed(2)}</span>
          <div className="w-px h-3 bg-border-2" />
        </>
      )}
      <span className="font-sans text-text-4 uppercase tracking-widest">
        {fromLabel}
      </span>
      <input
        type="number"
        step="5"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        placeholder="—"
        className="font-mono w-16 bg-transparent text-text-3 outline-none text-right border-b border-border [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
      />
      <button
        onClick={toggle}
        className="text-text-4 hover:text-amber transition-colors hover:cursor-pointer select-none"
      >
        ⇄
      </button>
      <span className="font-sans text-text-4 uppercase tracking-widest">
        {toLabel}
      </span>
      <span
        className="font-mono w-16 text-left"
        style={{ color: outputNum !== null ? outputColor : THEME.text4 }}
      >
        {outputNum !== null ? outputNum.toFixed(2) : "—"}
      </span>
    </div>
  );
}
