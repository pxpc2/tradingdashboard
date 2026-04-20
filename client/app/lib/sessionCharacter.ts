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

  let classification: PriceCharacter["classification"];
  if (magnitude < 0.3) {
    classification = "flat";
  } else if (character >= 0.7) {
    classification = "trending";
  } else if (magnitude >= 1.0) {
    if (character >= 0.4) classification = "partial_reversal";
    else classification = "reversal";
  } else {
    classification = "flat";
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

// ─── Live read (price + skew narration) ───────────────────────────────────────

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

export const TONE_COLOR: Record<
  "quiet" | "normal" | "attention" | "alert",
  string
> = {
  quiet: THEME.tone.quiet,
  normal: THEME.tone.normal,
  attention: THEME.tone.attention,
  alert: THEME.tone.alert,
};

// ─── Auto-generated condition tags ────────────────────────────────────────────

export type TagCode =
  | "MACRO-DAY"
  | "PIN-RISK"
  | "CONFIRMED-TREND"
  | "UNCONFIRMED-TREND"
  | "REVERSING"
  | "VOL-CRUSH"
  | "SKEW-RISING"
  | "SKEW-FALLING"
  | "PUT-IV-BID"
  | "CALL-IV-BID"
  | "VIX1D-HOT"
  | "VIX1D-COOL";

export type Tag = {
  code: TagCode;
  color: string;
  priority: number;
};

export type TagContext = {
  price: PriceCharacter;
  skew: SkewCharacter;
  putIv: number | null;
  callIv: number | null;
  atmIv: number | null;
  vix1dVixRatio: number | null;
  hasMacro: boolean;
  minutesSinceOpen: number;
};

// Priority: lower number = higher priority (renders first).
// Max 5 shown.
export function computeTags(ctx: TagContext): Tag[] {
  const tags: Tag[] = [];

  // Macro day — always highest priority when present
  if (ctx.hasMacro) {
    tags.push({ code: "MACRO-DAY", color: THEME.amber, priority: 1 });
  }

  // Price + skew cross-reference (only when we have enough data)
  if (
    ctx.price.classification !== "insufficient" &&
    ctx.skew.openingSkew !== null
  ) {
    if (ctx.price.classification === "trending") {
      const skewMoves =
        ctx.skew.strength === "moving" ||
        ctx.skew.strength === "strongly_moving";
      if (skewMoves) {
        tags.push({ code: "CONFIRMED-TREND", color: THEME.up, priority: 2 });
      } else {
        tags.push({
          code: "UNCONFIRMED-TREND",
          color: THEME.down,
          priority: 2,
        });
      }
    } else if (ctx.price.classification === "reversal") {
      tags.push({ code: "REVERSING", color: THEME.skew.moving, priority: 2 });
    } else if (
      ctx.price.classification === "flat" &&
      ctx.price.magnitude < 0.3 &&
      ctx.price.character < 0.3
    ) {
      tags.push({ code: "PIN-RISK", color: THEME.amber, priority: 3 });
    }

    // Vol crush — only meaningful after ~2h into session
    if (
      ctx.minutesSinceOpen >= 120 &&
      ctx.price.classification === "flat" &&
      ctx.price.magnitude < 0.5
    ) {
      tags.push({ code: "VOL-CRUSH", color: THEME.indigo, priority: 5 });
    }
  }

  // Skew direction — only tag when strongly moving
  if (ctx.skew.strength === "strongly_moving") {
    if (ctx.skew.direction === "rising") {
      tags.push({ code: "SKEW-RISING", color: THEME.amber, priority: 4 });
    } else if (ctx.skew.direction === "falling") {
      tags.push({ code: "SKEW-FALLING", color: THEME.indigo, priority: 4 });
    }
  }

  // IV structure — call/put dominance
  if (ctx.putIv !== null && ctx.callIv !== null) {
    const spread = ctx.putIv - ctx.callIv;
    if (spread > 0.02) {
      tags.push({ code: "PUT-IV-BID", color: THEME.down, priority: 6 });
    } else if (spread < -0.01) {
      tags.push({ code: "CALL-IV-BID", color: THEME.up, priority: 6 });
    }
  }

  // VIX1D/VIX ratio — term-structure signal
  if (ctx.vix1dVixRatio !== null) {
    if (ctx.vix1dVixRatio > 1.1) {
      tags.push({ code: "VIX1D-HOT", color: THEME.amber, priority: 7 });
    } else if (ctx.vix1dVixRatio < 0.9) {
      tags.push({ code: "VIX1D-COOL", color: THEME.indigo, priority: 7 });
    }
  }

  return tags.sort((a, b) => a.priority - b.priority).slice(0, 5);
}
