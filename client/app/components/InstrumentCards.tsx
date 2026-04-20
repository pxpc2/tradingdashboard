"use client";

import { THEME } from "../lib/theme";

type InstrumentTick = {
  label: string;
  price: number | null;
  prevClose: number | null;
  isOpen: boolean;
};

type Props = {
  instruments: InstrumentTick[];
};

function pctChange(
  current: number | null,
  prev: number | null,
): string | null {
  if (!current || !prev || prev === 0) return null;
  return (((current - prev) / prev) * 100).toFixed(2);
}

function absChange(current: number | null, prev: number | null): string | null {
  if (current === null || prev === null) return null;
  return (current - prev).toFixed(2);
}

function pctColor(pct: string | null): string {
  if (!pct) return THEME.text3;
  return parseFloat(pct) >= 0 ? THEME.up : THEME.down;
}

function InstrumentCard({
  instrument,
  isFirst,
}: {
  instrument: InstrumentTick;
  isFirst: boolean;
}) {
  const { label, price, prevClose, isOpen } = instrument;
  const pct = pctChange(price, prevClose);
  const abs = absChange(price, prevClose);
  const color = pctColor(pct);
  const statusDotColor = isOpen ? THEME.up : THEME.down;

  return (
    <div
      className={`bg-page px-3 py-2.5 ${isFirst ? "" : "border-l border-border-2"}`}
    >
      <div className="flex items-center gap-1.5 mb-1.5">
        <span
          className="text-[8px] leading-none"
          style={{ color: statusDotColor }}
          aria-label={isOpen ? "open" : "closed"}
        >
          ●
        </span>
        <span className="font-sans text-xs uppercase tracking-[0.05em] text-text-4">
          {label}
        </span>
      </div>
      <div className="font-mono text-xl text-text font-medium leading-tight">
        {price !== null ? price.toFixed(2) : "—"}
      </div>
      <div className="flex items-center gap-2 mt-1">
        {abs !== null && (
          <span className="font-mono text-xs" style={{ color }}>
            {parseFloat(abs) >= 0 ? "+" : ""}
            {abs}
          </span>
        )}
        {pct !== null && (
          <span className="font-mono text-xs" style={{ color }}>
            {parseFloat(pct) >= 0 ? "+" : ""}
            {pct}%
          </span>
        )}
      </div>
    </div>
  );
}

export default function InstrumentCards({ instruments }: Props) {
  return (
    <div className="grid grid-cols-4 border border-border-2">
      {instruments.map((i, idx) => (
        <InstrumentCard key={i.label} instrument={i} isFirst={idx === 0} />
      ))}
    </div>
  );
}
