"use client";

import {
  PriceCharacter,
  SkewCharacter,
  computeTags,
} from "../lib/sessionCharacter";
import { THEME } from "../lib/theme";

type Props = {
  price: PriceCharacter;
  skew: SkewCharacter;
  skewPctile: number | null;
  realizedPts: number | null;
  realizedPct: number | null;
  openingStraddle: number | null;
  minutesSinceOpen: number;
  timestamp: string | null;
};

function priceNarrative(p: PriceCharacter): string {
  if (p.classification === "insufficient") return "AWAITING DATA";
  if (p.classification === "flat") return "PRICE PINNED";
  if (p.classification === "trending") {
    const arrow =
      p.direction === "up" ? " ↑" : p.direction === "down" ? " ↓" : "";
    return `TREND DAY${arrow}`;
  }
  if (p.classification === "partial_reversal") return "PARTIAL REVERSAL DAY";
  if (p.classification === "reversal") return "CHOPPY DAY";
  return "PRICE —";
}

function skewNarrative(s: SkewCharacter): string {
  if (s.strength === "flat" || s.direction === "flat") return "FLAT SKEW";
  const dir = s.direction === "rising" ? "RISING" : "FALLING";
  const suffix = s.strength === "strongly_moving" ? " STRONG" : "";
  return `SKEW ${dir}${suffix}`;
}

function synthesis(p: PriceCharacter, s: SkewCharacter): string {
  if (p.classification === "insufficient") return "";
  if (s.direction === "flat" || s.strength === "flat") return "";
  const priceUp = p.direction === "up";
  const priceDown = p.direction === "down";
  const skewRising = s.direction === "rising";
  const skewFalling = s.direction === "falling";
  if (p.classification === "trending") {
    if ((priceUp && skewFalling) || (priceDown && skewRising))
      return "SKEW CONFIRMING";
    if ((priceUp && skewRising) || (priceDown && skewFalling))
      return "SKEW DIVERGING";
  }
  return "";
}

function buildNarrative(p: PriceCharacter, s: SkewCharacter): string {
  const base = `${priceNarrative(p)} · ${skewNarrative(s)}`;
  const synth = synthesis(p, s);
  return synth ? `${base} — ${synth}` : base;
}

function Evidence({
  price,
  skew,
  skewPctile,
  realizedPts,
  realizedPct,
  openingStraddle,
}: {
  price: PriceCharacter;
  skew: SkewCharacter;
  skewPctile: number | null;
  realizedPts: number | null;
  realizedPct: number | null;
  openingStraddle: number | null;
}) {
  const hasPrice = price.classification !== "insufficient";
  const hasSkew = skew.currentSkew !== null;
  const hasRv = realizedPts !== null && openingStraddle !== null;

  const showArrow =
    hasPrice &&
    price.classification !== "partial_reversal" &&
    price.classification !== "reversal" &&
    price.direction !== "flat";
  const arrowGlyph = price.direction === "up" ? "↑" : "↓";
  const arrowColor = price.direction === "up" ? THEME.up : THEME.down;

  const pricePart = hasPrice && (
    <span key="p">
      <span className="text-text-4">PRICE </span>
      <span className="text-text-2">{price.magnitude.toFixed(2)}×</span>
      <span className="text-text-4"> peak · </span>
      <span className="text-text-2">
        {(price.magnitude * price.character).toFixed(2)}×
      </span>
      <span className="text-text-4"> held</span>
      {showArrow && (
        <>
          <span className="text-text-4"> </span>
          <span style={{ color: arrowColor }}>{arrowGlyph}</span>
        </>
      )}
    </span>
  );

  const skewPart = hasSkew && (
    <span key="s">
      <span className="text-text-4">SKEW </span>
      <span className="text-text-2">{skew.currentSkew!.toFixed(3)}</span>
      <span className="text-text-4"> · Δ</span>
      <span className="text-text-2">
        {skew.netChange >= 0 ? "+" : ""}
        {skew.netChange.toFixed(3)}
      </span>
      {skewPctile !== null && (
        <>
          <span className="text-text-4"> · </span>
          <span className="text-text-2">{skewPctile}%ile</span>
        </>
      )}
    </span>
  );

  const rvColor =
    realizedPct !== null && realizedPct >= 100 ? THEME.down : THEME.text2;

  const rvPart = hasRv && (
    <span key="r">
      <span className="text-text-4">RV/IV </span>
      <span className="text-text-2">{realizedPts!.toFixed(1)}</span>
      <span className="text-text-4">/</span>
      <span className="text-text-2">{openingStraddle!.toFixed(1)}</span>
      <span className="text-text-4"> pt</span>
      {realizedPct !== null && (
        <>
          <span className="text-text-4"> · </span>
          <span style={{ color: rvColor }}>{realizedPct.toFixed(0)}%</span>
        </>
      )}
    </span>
  );

  const parts = [pricePart, skewPart, rvPart].filter(Boolean);

  if (parts.length === 0) {
    return (
      <div className="font-mono text-[11px] text-text-5">
        Awaiting session data…
      </div>
    );
  }

  return (
    <div className="font-mono text-[11px] flex flex-wrap items-baseline gap-x-5 gap-y-1">
      {parts}
    </div>
  );
}

function Pill({ code, color }: { code: string; color: string }) {
  return (
    <span
      className="font-mono text-[10px] uppercase tracking-wide px-1.5 py-0.5 border leading-none whitespace-nowrap"
      style={{ color, borderColor: color }}
    >
      {code}
    </span>
  );
}

function formatTimestamp(ts: string | null): string | null {
  if (!ts) return null;
  try {
    return new Date(ts).toLocaleTimeString("en-GB", {
      timeZone: "America/Chicago",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
  } catch {
    return null;
  }
}

export default function LiveReadPanel({
  price,
  skew,
  skewPctile,
  realizedPts,
  realizedPct,
  openingStraddle,
  minutesSinceOpen,
  timestamp,
}: Props) {
  const tags = computeTags({ price, skew, minutesSinceOpen });
  const narrative = buildNarrative(price, skew);
  const timeStr = formatTimestamp(timestamp);

  return (
    <div className="relative bg-page border border-border-2 border-l-2 border-l-amber px-3 py-2.5">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex items-center gap-3 shrink-0 flex-wrap">
          <span className="font-sans text-xs uppercase tracking-[0.05em] text-text-4">
            LIVE READ
          </span>
          {timeStr && (
            <span className="font-mono text-[11px] text-text-5">{timeStr}</span>
          )}
        </div>
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 justify-end">
            {tags.map((t) => (
              <Pill key={t.code} code={t.code} color={t.color} />
            ))}
          </div>
        )}
      </div>

      <div className="font-sans text-sm uppercase tracking-[0.04em] text-text leading-snug mb-2">
        {narrative}
      </div>

      <Evidence
        price={price}
        skew={skew}
        skewPctile={skewPctile}
        realizedPts={realizedPts}
        realizedPct={realizedPct}
        openingStraddle={openingStraddle}
      />
    </div>
  );
}
