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

function skewLabel(s: SkewCharacter): string {
  if (s.strength === "flat") return "FLAT";
  if (s.strength === "moving") return "MOVING";
  return "STRONG";
}

function priceLabel(p: PriceCharacter): string {
  if (p.classification === "insufficient") return "—";
  if (p.classification === "flat") {
    return p.magnitude < 0.3 ? "PINNED" : "CHOPPY";
  }
  if (p.classification === "trending") {
    if (p.direction === "up") return "TRENDING ↑";
    if (p.direction === "down") return "TRENDING ↓";
    return "TRENDING";
  }
  if (p.classification === "partial_reversal") return "PART REV";
  if (p.classification === "reversal") return "REVERSING";
  return "—";
}

function priceColor(p: PriceCharacter): string {
  if (p.classification === "insufficient") return THEME.text5;
  if (p.classification === "trending") {
    return p.direction === "up"
      ? THEME.up
      : p.direction === "down"
        ? THEME.down
        : THEME.text;
  }
  if (p.classification === "partial_reversal") return THEME.amber;
  if (p.classification === "reversal") return THEME.amber;
  if (p.classification === "flat") {
    return p.magnitude < 0.3 ? THEME.amber : THEME.text;
  }
  return THEME.text;
}

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
    value === null || maxIv === 0
      ? 0
      : Math.min(100, (value / maxIv) * 100);
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

export default function CharacterIvStructure({
  skewChar,
  priceChar,
  callIv,
  putIv,
  atmIv,
}: Props) {
  const ivs = [callIv, putIv, atmIv].filter((v): v is number => v !== null);
  const maxIv = ivs.length > 0 ? Math.max(...ivs) : 0;

  return (
    <div className="grid grid-cols-2 border border-border-2">
      {/* CHARACTER */}
      <div className="bg-page px-3 py-2">
        <div className="font-sans text-xs uppercase tracking-[0.05em] text-text-4 mb-2">
          Character
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center gap-3">
            <span className="font-sans text-xs uppercase tracking-[0.05em] text-text-4 w-12 shrink-0">
              Skew
            </span>
            <span
              className="font-mono text-sm font-medium"
              style={{ color: SKEW_STRENGTH_COLOR[skewChar.strength] }}
            >
              {skewLabel(skewChar)}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="font-sans text-xs uppercase tracking-[0.05em] text-text-4 w-12 shrink-0">
              Price
            </span>
            <span
              className="font-mono text-sm font-medium"
              style={{ color: priceColor(priceChar) }}
            >
              {priceLabel(priceChar)}
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
