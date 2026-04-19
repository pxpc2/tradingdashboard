"use client";

import { SkewCharacter, SKEW_STRENGTH_COLOR } from "../lib/sessionCharacter";

type Props = {
  skewChar: SkewCharacter;
  compact?: boolean; // For inline use in metrics strip
};

function strengthLabel(s: SkewCharacter["strength"]): string {
  if (s === "flat") return "flat";
  if (s === "moving") return "moving";
  return "strongly moving";
}

function directionArrow(d: SkewCharacter["direction"]): string {
  if (d === "rising") return "↗";
  if (d === "falling") return "↘";
  return "→";
}

export default function SkewCharacterBadge({ skewChar, compact }: Props) {
  if (skewChar.openingSkew === null) {
    return (
      <div>
        <span className="font-sans text-[11px] text-[#555] uppercase tracking-wide">
          Skew hoje
        </span>
        <div className="font-mono text-sm text-[#444]">—</div>
      </div>
    );
  }

  const color = SKEW_STRENGTH_COLOR[skewChar.strength];
  const arrow = directionArrow(skewChar.direction);
  const label = strengthLabel(skewChar.strength);

  if (compact) {
    return (
      <div className="flex items-center gap-1.5 font-mono text-xs">
        <span style={{ color }}>{arrow}</span>
        <span style={{ color }}>{label}</span>
        <span className="text-[#444]">
          {(skewChar.maxExcursion * 1000).toFixed(1)}
        </span>
      </div>
    );
  }

  return (
    <div>
      <span className="font-sans text-[11px] text-[#555] uppercase tracking-wide">
        Skew hoje
      </span>
      <div
        className="font-mono text-lg font-light flex items-center gap-1.5"
        style={{ color }}
      >
        <span>{arrow}</span>
        <span>{label}</span>
      </div>
      <div className="font-mono text-[10px] text-[#444]">
        max Δ {skewChar.maxExcursion.toFixed(4)}
        {skewChar.netChange !== 0 && (
          <span className="ml-1">
            · net {skewChar.netChange > 0 ? "+" : ""}
            {skewChar.netChange.toFixed(4)}
          </span>
        )}
      </div>
    </div>
  );
}
