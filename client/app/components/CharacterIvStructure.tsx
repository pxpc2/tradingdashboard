"use client";

import {
  SkewCharacter,
  PriceCharacter,
  SKEW_STRENGTH_COLOR,
} from "../lib/sessionCharacter";
import { THEME } from "../lib/theme";

type Props = {
  skewChar: SkewCharacter;
  priceChar: PriceCharacter;
  callIv: number | null;
  putIv: number | null;
  atmIv: number | null;
};

// ─── Skew row helpers ─────────────────────────────────────────────────────

function skewStateLabel(s: SkewCharacter): string {
  if (s.strength === "flat" || s.direction === "flat") return "FLAT";
  const base = s.direction === "rising" ? "RISING" : "FALLING";
  const suffix = s.strength === "strongly_moving" ? " STRONG" : "";
  return `${base}${suffix}`;
}

function skewStateColor(s: SkewCharacter): string {
  if (s.strength === "flat" || s.direction === "flat") {
    return SKEW_STRENGTH_COLOR.flat;
  }
  return SKEW_STRENGTH_COLOR[s.strength];
}

function skewNumbers(s: SkewCharacter): string | null {
  if (s.currentSkew === null) return null;
  const sign = s.netChange >= 0 ? "+" : "";
  return `Δ${sign}${s.netChange.toFixed(3)} · max ${s.maxExcursion.toFixed(3)}`;
}

// ─── Price row helpers ────────────────────────────────────────────────────

function priceStateLabel(p: PriceCharacter): string {
  if (p.classification === "insufficient") return "—";
  if (p.classification === "flat") {
    return p.magnitude < 0.3 ? "PINNED" : "CHOPPY";
  }
  if (p.classification === "trending") {
    if (p.direction === "up") return "TRENDING UP";
    if (p.direction === "down") return "TRENDING DOWN";
    return "TRENDING";
  }
  if (p.classification === "partial_reversal") return "PARTIAL REVERSAL";
  if (p.classification === "reversal") return "FULL REVERSAL";
  return "—";
}

function priceStateColor(p: PriceCharacter): string {
  if (p.classification === "insufficient") return THEME.text5;
  if (p.classification === "trending") {
    if (p.direction === "up") return THEME.up;
    if (p.direction === "down") return THEME.down;
    return THEME.text;
  }
  if (p.classification === "partial_reversal") return THEME.amber;
  if (p.classification === "reversal") return THEME.amber;
  if (p.classification === "flat") {
    return p.magnitude < 0.3 ? THEME.amber : THEME.text;
  }
  return THEME.text;
}

function priceNumbers(p: PriceCharacter): {
  text: string;
  arrow: { glyph: string; color: string } | null;
} | null {
  if (p.classification === "insufficient") return null;

  const text = `${p.maxMove.toFixed(1)}pt max · ${p.currentMove.toFixed(1)}pt held`;

  // Drop arrow for reversal states — focus isn't direction there.
  const showArrow =
    p.classification !== "partial_reversal" &&
    p.classification !== "reversal" &&
    p.direction !== "flat";

  if (!showArrow) return { text, arrow: null };

  return {
    text,
    arrow: {
      glyph: p.direction === "up" ? "↑" : "↓",
      color: p.direction === "up" ? THEME.up : THEME.down,
    },
  };
}

// ─── IV bars ──────────────────────────────────────────────────────────────

function IvBar({
  label,
  value,
  color,
  maxIv,
}: {
  label: string;
  value: number | null;
  color: string;
  maxIv: number;
}) {
  const pct =
    value === null || maxIv === 0 ? 0 : Math.min(100, (value / maxIv) * 100);
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="font-sans text-text-4 uppercase tracking-[0.05em] w-10 shrink-0">
        {label}
      </span>
      <div className="flex-1 h-2 bg-panel relative overflow-hidden">
        <div
          className="absolute left-0 top-0 bottom-0 transition-all duration-300"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
      <span className="font-mono text-text-2 w-10 text-right shrink-0">
        {value !== null ? (value * 100).toFixed(1) : "—"}
      </span>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────

export default function CharacterIvStructure({
  skewChar,
  priceChar,
  callIv,
  putIv,
  atmIv,
}: Props) {
  const ivs = [callIv, putIv, atmIv].filter((v): v is number => v !== null);
  const maxIv = ivs.length > 0 ? Math.max(...ivs) : 0;

  const skewNums = skewNumbers(skewChar);
  const priceNums = priceNumbers(priceChar);

  return (
    <div className="grid grid-cols-2 border border-border-2">
      {/* CHARACTER */}
      <div className="bg-page px-3 py-2">
        <div className="font-sans text-xs uppercase tracking-[0.05em] text-text-4 mb-2">
          Character
        </div>
        <div className="space-y-1.5">
          {/* Skew row */}
          <div className="flex items-center gap-3">
            <span className="font-sans text-xs uppercase tracking-[0.05em] text-text-4 w-12 shrink-0">
              Skew
            </span>
            <span className="flex-1 font-mono text-[11px] text-text-3 truncate">
              {skewNums ?? "—"}
            </span>
            <span
              className="font-mono text-sm font-medium shrink-0 whitespace-nowrap"
              style={{ color: skewStateColor(skewChar) }}
            >
              {skewStateLabel(skewChar)}
            </span>
          </div>

          {/* Price row */}
          <div className="flex items-center gap-3">
            <span className="font-sans text-xs uppercase tracking-[0.05em] text-text-4 w-12 shrink-0">
              Price
            </span>
            <span className="flex-1 font-mono text-[11px] text-text-3 truncate">
              {priceNums ? (
                <>
                  {priceNums.text}
                  {priceNums.arrow && (
                    <>
                      <span className="text-text-4"> </span>
                      <span style={{ color: priceNums.arrow.color }}>
                        {priceNums.arrow.glyph}
                      </span>
                    </>
                  )}
                </>
              ) : (
                "—"
              )}
            </span>
            <span
              className="font-mono text-sm font-medium shrink-0 whitespace-nowrap"
              style={{ color: priceStateColor(priceChar) }}
            >
              {priceStateLabel(priceChar)}
            </span>
          </div>
        </div>
      </div>

      {/* IV STRUCTURE */}
      <div className="bg-page px-3 py-2 border-l border-border-2">
        <div className="font-sans text-xs uppercase tracking-[0.05em] text-text-4 mb-2">
          IV Structure
        </div>
        <div className="space-y-1">
          <IvBar label="Call" value={callIv} color={THEME.up} maxIv={maxIv} />
          <IvBar label="Put" value={putIv} color={THEME.down} maxIv={maxIv} />
          <IvBar label="ATM" value={atmIv} color={THEME.text3} maxIv={maxIv} />
        </div>
      </div>
    </div>
  );
}
