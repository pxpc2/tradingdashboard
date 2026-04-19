"use client";

import {
  PriceCharacter,
  SkewCharacter,
  buildLiveRead,
  TONE_COLOR,
} from "../lib/sessionCharacter";

type Props = {
  price: PriceCharacter;
  skew: SkewCharacter;
};

export default function LiveReadLine({ price, skew }: Props) {
  const { text, tone } = buildLiveRead(price, skew);

  if (!text) return null;

  const color = TONE_COLOR[tone];

  return (
    <div className="flex items-center gap-2 py-2 px-3 bg-panel rounded">
      <span className="font-sans text-[11px] text-text-4 uppercase tracking-wide shrink-0">
        Live read
      </span>
      <div className="w-px h-3 bg-border" />
      <span className="font-mono text-xs" style={{ color }}>
        {text}
      </span>
    </div>
  );
}
