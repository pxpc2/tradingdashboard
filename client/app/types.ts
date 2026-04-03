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
