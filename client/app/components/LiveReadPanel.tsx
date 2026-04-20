"use client";

import {
  buildLiveRead,
  computeTags,
  PriceCharacter,
  SkewCharacter,
  TagContext,
  Tag,
} from "../lib/sessionCharacter";
import { THEME, withOpacity } from "../lib/theme";

type Props = {
  price: PriceCharacter;
  skew: SkewCharacter;
  putIv: number | null;
  callIv: number | null;
  atmIv: number | null;
  vix1dVixRatio: number | null;
  hasMacro: boolean;
  minutesSinceOpen: number;
  timestamp: string | null; // ISO
};

function formatCt(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", {
    timeZone: "America/Chicago",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function TagPill({ tag }: { tag: Tag }) {
  return (
    <span
      className="font-mono text-[9px] uppercase tracking-wide px-1.5 py-[1px] border whitespace-nowrap"
      style={{
        color: tag.color,
        borderColor: withOpacity(tag.color, 0.4),
        background: withOpacity(tag.color, 0.08),
      }}
    >
      {tag.code}
    </span>
  );
}

export default function LiveReadPanel({
  price,
  skew,
  putIv,
  callIv,
  atmIv,
  vix1dVixRatio,
  hasMacro,
  minutesSinceOpen,
  timestamp,
}: Props) {
  const read = buildLiveRead(price, skew);
  const tagCtx: TagContext = {
    price,
    skew,
    putIv,
    callIv,
    atmIv,
    vix1dVixRatio,
    hasMacro,
    minutesSinceOpen,
  };
  const tags = computeTags(tagCtx);

  const displayText =
    read.text.length > 0
      ? read.text
      : "Aguardando dados da sessão";

  return (
    <div
      className="border-l-2 px-3 py-2"
      style={{
        borderColor: THEME.amber,
        background: "rgba(245, 165, 36, 0.04)",
      }}
    >
      <div className="flex items-start justify-between gap-3 mb-1">
        <div className="flex items-baseline gap-2 shrink-0">
          <span
            className="font-sans text-[10px] uppercase tracking-wide"
            style={{ color: THEME.amber }}
          >
            Live Read
          </span>
          {timestamp && (
            <>
              <span className="text-text-5 text-[9px]">·</span>
              <span className="font-mono text-[10px] text-text-3">
                {formatCt(timestamp)}
              </span>
            </>
          )}
        </div>

        {tags.length > 0 && (
          <div className="flex items-center gap-1 flex-wrap justify-end">
            {tags.map((t) => (
              <TagPill key={t.code} tag={t} />
            ))}
          </div>
        )}
      </div>

      <div
        className="font-sans text-[13px] leading-snug uppercase tracking-[0.02em] font-medium"
        style={{ color: read.text.length > 0 ? THEME.text : THEME.text4 }}
      >
        {displayText}
      </div>
    </div>
  );
}
