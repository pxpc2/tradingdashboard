// Single source of truth for color tokens is globals.css @theme block.
// This file provides:
//   1. THEME — CSS variable REFERENCES for use in JSX inline styles.
//      style={{ color: THEME.up }} → style={{ color: 'var(--color-up)' }}
//      → browser resolves at render time → changing globals.css auto-updates.
//   2. cssVar() — runtime resolver for canvas / chart libraries that
//      can't use CSS variables (ECharts, lightweight-charts, native canvas).
//      Call from inside useEffect so window exists.
//   3. withOpacity() — wraps a CSS var in color-mix() to apply transparency.
//      Use instead of string concat like `${THEME.up}66` (which produces
//      invalid 'var(--color-up)66').

export const THEME = {
  // Foundation
  page: "var(--color-page)",
  panel: "var(--color-panel)",
  panel2: "var(--color-panel-2)",
  border: "var(--color-border)",
  border2: "var(--color-border-2)",

  // Text
  text: "var(--color-text)",
  text2: "var(--color-text-2)",
  text3: "var(--color-text-3)",
  text4: "var(--color-text-4)",
  text5: "var(--color-text-5)",
  text6: "var(--color-text-6)",

  // Accents
  amber: "var(--color-amber)",
  indigo: "var(--color-indigo)",

  // Semantic directional
  up: "var(--color-up)",
  down: "var(--color-down)",

  // Regime (analysis)
  regime: {
    trend: "var(--color-regime-trend)",
    partial: "var(--color-regime-partial)",
    reversal: "var(--color-regime-reversal)",
    flat: "var(--color-regime-flat)",
  },

  // Skew character
  skew: {
    flat: "var(--color-skew-flat)",
    moving: "var(--color-skew-moving)",
    strong: "var(--color-skew-strong)",
  },

  // Live read tones
  tone: {
    quiet: "var(--color-tone-quiet)",
    normal: "var(--color-tone-normal)",
    attention: "var(--color-tone-attention)",
    alert: "var(--color-tone-alert)",
  },

  // Status
  status: {
    open: "var(--color-status-open)",
    closed: "var(--color-status-closed)",
  },

  // SML fly widths
  width: {
    10: "var(--color-width-10)",
    15: "var(--color-width-15)",
    20: "var(--color-width-20)",
    25: "var(--color-width-25)",
    30: "var(--color-width-30)",
  } as Record<number, string>,
} as const;

/**
 * Resolve a CSS variable to its computed hex/rgb value at runtime.
 * Use for canvas / chart library configs that can't interpret var().
 * Not SSR-safe — call inside useEffect or event handlers.
 * Reads current document's :root computed styles.
 */
export function cssVar(name: string, fallback: string = "#000000"): string {
  if (typeof window === "undefined") return fallback;
  const val = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  return val || fallback;
}

/**
 * Build an opacified color string from a CSS variable.
 * Replacement for string concat like `${THEME.up}66`.
 *   withOpacity(THEME.up, 0.4) → 'color-mix(in srgb, var(--color-up) 40%, transparent)'
 */
export function withOpacity(cssVarRef: string, alpha: number): string {
  const pct = Math.round(Math.max(0, Math.min(1, alpha)) * 100);
  return `color-mix(in srgb, ${cssVarRef} ${pct}%, transparent)`;
}
