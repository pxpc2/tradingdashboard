// Utilities for computing live session character — skew + price
// Used by LiveDashboard, LiveTab, and TradingPlanDashboard.
// Color constants reference CSS variables — updating globals.css updates everything.

import { THEME, cssVar } from "./theme";

export type SkewCharacter = {
  direction: "rising" | "falling" | "flat";
  strength: "flat" | "moving" | "strongly_moving";
  maxExcursion: number;
  netChange: number;
  openingSkew: number | null;
  currentSkew: number | null;
};

export function computeSkewCharacter(
  todaySnapshots: { skew: number; created_at: string }[],
): SkewCharacter {
  if (todaySnapshots.length === 0) {
    return {
      direction: "flat",
      strength: "flat",
      maxExcursion: 0,
      netChange: 0,
      openingSkew: null,
      currentSkew: null,
    };
  }

  const sorted = [...todaySnapshots].sort(
    (a, b) =>
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );

  const opening = sorted[0].skew;
  const current = sorted[sorted.length - 1].skew;
  const skews = sorted.map((s) => s.skew);
  const maxS = Math.max(...skews);
  const minS = Math.min(...skews);

  const netChange = current - opening;
  const maxExcursion = Math.max(maxS - opening, opening - minS);

  let strength: "flat" | "moving" | "strongly_moving";
  if (maxExcursion < 0.008) strength = "flat";
  else if (maxExcursion < 0.015) strength = "moving";
  else strength = "strongly_moving";

  let direction: "rising" | "falling" | "flat";
  if (netChange > 0.003) direction = "rising";
  else if (netChange < -0.003) direction = "falling";
  else direction = "flat";

  return {
    direction,
    strength,
    maxExcursion: parseFloat(maxExcursion.toFixed(4)),
    netChange: parseFloat(netChange.toFixed(4)),
    openingSkew: opening,
    currentSkew: current,
  };
}

export type PriceCharacter = {
  magnitude: number;
  character: number;
  direction: "up" | "down" | "flat";
  classification:
    | "trending"
    | "partial_reversal"
    | "reversal"
    | "flat"
    | "insufficient";
  maxMove: number;
  currentMove: number;
};

export function computePriceCharacter(
  openingSpx: number | null,
  currentSpx: number | null,
  maxSpx: number | null,
  minSpx: number | null,
  openingStraddle: number | null,
): PriceCharacter {
  if (
    openingSpx === null ||
    currentSpx === null ||
    maxSpx === null ||
    minSpx === null ||
    openingStraddle === null ||
    openingStraddle <= 0
  ) {
    return {
      magnitude: 0,
      character: 0,
      direction: "flat",
      classification: "insufficient",
      maxMove: 0,
      currentMove: 0,
    };
  }

  const upMove = maxSpx - openingSpx;
  const downMove = openingSpx - minSpx;
  const maxMoveValue = Math.max(upMove, downMove);
  const currentMoveSigned = currentSpx - openingSpx;
  const currentMoveAbs = Math.abs(currentMoveSigned);
  const magnitude = maxMoveValue / openingStraddle;
  const character = maxMoveValue > 0 ? currentMoveAbs / maxMoveValue : 0;

  let direction: "up" | "down" | "flat";
  if (currentMoveAbs < 2) direction = "flat";
  else direction = currentMoveSigned > 0 ? "up" : "down";

  // Unified classification — no more magnitude-dependent branches.
  // A 0.5× range session that holds half its move is a partial reversal
  // just as much as a 1.5× range session that holds half.
  let classification: PriceCharacter["classification"];
  if (magnitude < 0.3) {
    classification = "flat";
  } else if (character >= 0.7) {
    classification = "trending";
  } else if (character >= 0.4) {
    classification = "partial_reversal";
  } else {
    classification = "reversal";
  }

  return {
    magnitude: parseFloat(magnitude.toFixed(2)),
    character: parseFloat(character.toFixed(2)),
    direction,
    classification,
    maxMove: parseFloat(maxMoveValue.toFixed(2)),
    currentMove: parseFloat(currentMoveAbs.toFixed(2)),
  };
}

// ─── Post-session classification ──────────────────────────────────────────────

export type SessionType =
  | "Trend day"
  | "Trend with partial reversal"
  | "Reversal day"
  | "Flat day";

export function classifySessionFinal(
  maxMovePct: number,
  eodMovePct: number,
): SessionType {
  const magnitude = maxMovePct / 100;
  const character = maxMovePct > 0 ? eodMovePct / maxMovePct : 0;

  if (magnitude < 0.3) return "Flat day";
  if (character >= 0.7) return "Trend day";
  if (magnitude < 1.0) return "Flat day";
  if (character >= 0.4) return "Trend with partial reversal";
  return "Reversal day";
}

export const SESSION_TYPE_COLOR: Record<SessionType, string> = {
  "Trend day": THEME.regime.trend,
  "Trend with partial reversal": THEME.regime.partial,
  "Reversal day": THEME.regime.reversal,
  "Flat day": THEME.regime.flat,
};

export function resolveSessionTypeColors(): Record<SessionType, string> {
  return {
    "Trend day": cssVar("--color-regime-trend", "#E55A3F"),
    "Trend with partial reversal": cssVar("--color-regime-partial", "#E6B84F"),
    "Reversal day": cssVar("--color-regime-reversal", "#5BB4A0"),
    "Flat day": cssVar("--color-regime-flat", "#707070"),
  };
}

export const SESSION_TYPE_ORDER: SessionType[] = [
  "Trend day",
  "Trend with partial reversal",
  "Reversal day",
  "Flat day",
];

// ─── Legacy live read (PT narration) ──────────────────────────────────────────
// Kept for backward compatibility with the old `/` LiveDashboard and
// TradingPlanDashboard. The new LiveTab uses LiveReadPanel's internal
// narrative composer (English) instead of this function.

export function buildLiveRead(
  price: PriceCharacter,
  skew: SkewCharacter,
): { text: string; tone: "quiet" | "normal" | "attention" | "alert" } {
  if (price.classification === "insufficient" || skew.openingSkew === null) {
    return { text: "", tone: "quiet" };
  }

  const arrow =
    price.direction === "up" ? "↑" : price.direction === "down" ? "↓" : "→";
  const skewFlat = skew.strength === "flat";
  const skewMoving = skew.strength === "moving";
  const skewStrong = skew.strength === "strongly_moving";

  if (price.classification === "trending") {
    if (skewMoving || skewStrong) {
      return {
        text: `Preço em tendência ${arrow} · Skew ${skewDirLabel(skew.direction)} — movimento direcional confirmado pelas opções`,
        tone: "normal",
      };
    }
    return {
      text: `Preço em tendência ${arrow} · Skew flat — risco de reversão elevado, opções não confirmam`,
      tone: "attention",
    };
  }

  if (price.classification === "partial_reversal") {
    if (skewStrong) {
      return {
        text: `Preço devolvendo parte ${arrow} · Skew forte ${skewDirLabel(skew.direction)} — convicção mista`,
        tone: "attention",
      };
    }
    return {
      text: `Preço devolvendo parte ${arrow} · Skew ${skewFlat ? "flat" : skewDirLabel(skew.direction)}`,
      tone: "normal",
    };
  }

  if (price.classification === "reversal") {
    return {
      text: `Preço em reversão · Skew ${skewFlat ? "flat" : skewDirLabel(skew.direction)} — mean-reversion se desenvolvendo`,
      tone: skewStrong ? "alert" : "normal",
    };
  }

  if (price.classification === "flat") {
    if (skewStrong) {
      return {
        text: `Preço parado · Skew forte ${skewDirLabel(skew.direction)} — vol sendo comprada sem movimento, observar`,
        tone: "attention",
      };
    }
    if (skewMoving) {
      return {
        text: `Preço parado · Skew ${skewDirLabel(skew.direction)} — opções reprecificando silenciosamente`,
        tone: "normal",
      };
    }
    return {
      text: `Preço parado · Skew flat — sessão quieta, straddle decaindo`,
      tone: "quiet",
    };
  }

  return { text: "", tone: "quiet" };
}

function skewDirLabel(dir: "rising" | "falling" | "flat"): string {
  if (dir === "rising") return "subindo";
  if (dir === "falling") return "caindo";
  return "flat";
}

export const SKEW_STRENGTH_COLOR: Record<SkewCharacter["strength"], string> = {
  flat: THEME.skew.flat,
  moving: THEME.skew.moving,
  strongly_moving: THEME.skew.strong,
};

type Tone = "quiet" | "normal" | "attention" | "alert";

export const TONE_COLOR: Record<Tone, string> = {
  quiet: THEME.tone.quiet,
  normal: THEME.tone.normal,
  attention: THEME.tone.attention,
  alert: THEME.tone.alert,
};
// ─── Auto-generated condition tags ────────────────────────────────────────────

export type TagCode =
  | "CONFIRMED-TREND"
  | "UNCONFIRMED-TREND"
  | "CONFIRMED-REVERSAL"
  | "UNCONFIRMED-REVERSAL"
  | "FLAT-DAY"
  | "SKEW-RISING"
  | "SKEW-FALLING"
  | "RV<IV";

export type Tag = {
  code: TagCode;
  color: string;
  priority: number;
};

export type TagContext = {
  price: PriceCharacter;
  skew: SkewCharacter;
  minutesSinceOpen: number;
};

// Priority: lower number = higher priority (renders first).
// Max 5 shown.
export function computeTags(ctx: TagContext): Tag[] {
  const tags: Tag[] = [];

  if (
    ctx.price.classification === "insufficient" ||
    ctx.skew.openingSkew === null
  ) {
    return [];
  }

  const skewActive =
    ctx.skew.strength === "moving" || ctx.skew.strength === "strongly_moving";

  const dirColor =
    ctx.price.direction === "up"
      ? THEME.up
      : ctx.price.direction === "down"
        ? THEME.down
        : THEME.text;

  if (ctx.price.classification === "trending") {
    tags.push(
      skewActive
        ? { code: "CONFIRMED-TREND", color: dirColor, priority: 2 }
        : { code: "UNCONFIRMED-TREND", color: THEME.amber, priority: 2 },
    );
  }

  if (ctx.price.classification === "reversal") {
    tags.push(
      skewActive
        ? { code: "UNCONFIRMED-REVERSAL", color: THEME.amber, priority: 2 }
        : { code: "CONFIRMED-REVERSAL", color: THEME.indigo, priority: 2 },
    );
  }

  if (
    ctx.price.classification === "flat" &&
    ctx.price.magnitude < 0.3 &&
    ctx.price.character < 0.3
  ) {
    tags.push({ code: "FLAT-DAY", color: THEME.indigo, priority: 3 });
  }

  if (ctx.skew.strength === "strongly_moving") {
    if (ctx.skew.direction === "rising") {
      tags.push({ code: "SKEW-RISING", color: THEME.amber, priority: 4 });
    } else if (ctx.skew.direction === "falling") {
      tags.push({ code: "SKEW-FALLING", color: THEME.indigo, priority: 4 });
    }
  }

  if (
    ctx.minutesSinceOpen >= 120 &&
    ctx.price.classification === "flat" &&
    ctx.price.magnitude < 0.5
  ) {
    tags.push({ code: "RV<IV", color: THEME.indigo, priority: 5 });
  }

  return tags.sort((a, b) => a.priority - b.priority).slice(0, 5);
}
