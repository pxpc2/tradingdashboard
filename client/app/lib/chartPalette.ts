// Shared resolver for chart (canvas) configs.
// Call inside useEffect — reads current CSS vars and returns hex strings.
// Canvas libraries (ECharts, lightweight-charts) can't interpret var() themselves.

import { cssVar } from "./theme";

export type ChartPalette = {
  bg: string;
  border: string;
  border2: string;
  text2: string;
  text3: string;
  text4: string;
  text5: string;
  text6: string;
  amber: string;
  indigo: string;
  up: string;
  down: string;
  skewMoving: string;
  regime: {
    trend: string;
    partial: string;
    reversal: string;
    flat: string;
  };
};

export function resolveChartPalette(): ChartPalette {
  return {
    bg: cssVar("--color-panel", "#121214"),
    border: cssVar("--color-border", "#1f1f21"),
    border2: cssVar("--color-border-2", "#2a2a2d"),
    text2: cssVar("--color-text-2", "#9A9890"),
    text3: cssVar("--color-text-3", "#6E6C67"),
    text4: cssVar("--color-text-4", "#555350"),
    text5: cssVar("--color-text-5", "#44433F"),
    text6: cssVar("--color-text-6", "#2F2E2C"),
    amber: cssVar("--color-amber", "#F5A524"),
    indigo: cssVar("--color-indigo", "#7EA8C4"),
    up: cssVar("--color-up", "#7FC096"),
    down: cssVar("--color-down", "#D0695E"),
    skewMoving: cssVar("--color-skew-moving", "#9B7BB3"),
    regime: {
      trend: cssVar("--color-regime-trend", "#E55A3F"),
      partial: cssVar("--color-regime-partial", "#E6B84F"),
      reversal: cssVar("--color-regime-reversal", "#5BB4A0"),
      flat: cssVar("--color-regime-flat", "#707070"),
    },
  };
}
