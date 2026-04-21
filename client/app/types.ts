export type StraddleSnapshot = {
  id: string;
  created_at: string;
  spx_ref: number;
  atm_strike: number;
  call_bid: number;
  call_ask: number;
  put_bid: number;
  put_ask: number;
  straddle_mid: number;
  es_basis?: number | null;
};

export type RtmSession = {
  id: string;
  created_at: string;
  sml_ref: number | null;
  sal_ref: number | null;
  widths: number[] | null;
  type: string | null;
};

export type FlySnapshot = {
  id: string;
  created_at: string;
  session_id: string;
  width: number;
  mid: number;
  bid: number;
  ask: number;
};

export type SkewSnapshot = {
  id: string;
  created_at: string;
  skew: number;
  put_iv: number;
  call_iv: number;
  atm_iv: number;
  expiration_date: string;
  put_strike: number;
  call_strike: number;
};

export type EsSnapshot = {
  id: string;
  created_at: string;
  es_ref: number;
  open?: number | null;
  high?: number | null;
  low?: number | null;
};

export type SpxSnapshot = {
  id: string;
  created_at: string;
  open: number;
  high: number;
  low: number;
  close: number;
};

export type ChartRange = "1H" | "4H" | "1D" | "3D" | "5D";

// ── Dealer data ──────────────────────────────────────────────────────────────

// One element of the strikes array from the API
// [strike, net, call_metric, put_metric, call_mid, put_mid]
export type DealerStrikeRow = [
  number, // strike
  number, // net (gex or cex)
  number, // call side
  number, // put side
  number | null, // call_mid
  number | null, // put_mid
];

export type DealerMetric = "gex" | "cex";

export type DealerStrikeSnapshot = {
  id: number;
  created_at: string;
  date: string; // YYYY-MM-DD
  bar_time: string; // HH:MM ET
  metric: DealerMetric;
  total: number;
  strikes: DealerStrikeRow[];
  spot_ref: number | null;
  local_total: number | null;
  top_pos_strike: number | null;
  top_pos_value: number | null;
  top_neg_strike: number | null;
  top_neg_value: number | null;
};

export type DealerTimelineBar = {
  ts: string; // HH:MM ET
  gex: number;
  call_gex: number;
  put_gex: number;
  dex: number;
};

export type DealerTimelineSnapshot = {
  id: number;
  created_at: string;
  date: string;
  data: DealerTimelineBar[];
  open_gex: number | null;
  close_gex: number | null;
  min_gex: number | null;
  max_gex: number | null;
  regime_open: "neg" | "pos" | null;
};
