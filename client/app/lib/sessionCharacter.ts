// Utilities for computing live session character — skew + price
// Used by both LiveDashboard and TradingPlanDashboard

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
  magnitude: number; // maxMove / straddle
  character: number; // currentMoveAbs / maxMove
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
  // Not enough magnitude to classify as any trending/reversing type
  if (magnitude < 0.3) {
    classification = "flat";
  } else if (character >= 0.7) {
    // Price held direction regardless of size — trend
    classification = "trending";
  } else if (magnitude >= 1.0) {
    // Market exceeded implied move — classify character of reversal
    if (character >= 0.4) classification = "partial_reversal";
    else classification = "reversal";
  } else {
    // Below implied, didn't hold direction — flat
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

// Combines price + skew into a single narrated line
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

  // Trending price
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

  // Partial reversal
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

  // Reversal
  if (price.classification === "reversal") {
    return {
      text: `Preço em reversão · Skew ${skewFlat ? "flat" : skewDirLabel(skew.direction)} — mean-reversion se desenvolvendo`,
      tone: skewStrong ? "alert" : "normal",
    };
  }

  // Flat price
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

// Color tokens for badges
export const SKEW_STRENGTH_COLOR: Record<SkewCharacter["strength"], string> = {
  flat: "#9ca3af",
  moving: "#9CA9FF",
  strongly_moving: "#f59e0b",
};

export const TONE_COLOR: Record<
  "quiet" | "normal" | "attention" | "alert",
  string
> = {
  quiet: "#555",
  normal: "#9ca3af",
  attention: "#f59e0b",
  alert: "#f87171",
};
