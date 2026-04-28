// ─── BSM Math ────────────────────────────────────────────────────────────────

export function normalCDF(x) {
  const a1 = 0.254829592,
    a2 = -0.284496736,
    a3 = 1.421413741;
  const a4 = -1.453152027,
    a5 = 1.061405429,
    p = 0.3275911;
  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x) / Math.sqrt(2);
  const t = 1.0 / (1.0 + p * x);
  const y =
    1.0 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  return 0.5 * (1.0 + sign * y);
}

export function bsmPrice(S, K, T, r, sigma, isCall) {
  if (T <= 0) return Math.max(0, isCall ? S - K : K - S);
  const d1 =
    (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
  const d2 = d1 - sigma * Math.sqrt(T);
  if (isCall) return S * normalCDF(d1) - K * Math.exp(-r * T) * normalCDF(d2);
  return K * Math.exp(-r * T) * normalCDF(-d2) - S * normalCDF(-d1);
}

export function bsmDelta(S, K, T, r, sigma, isCall) {
  if (T <= 0) return isCall ? (S > K ? 1 : 0) : S < K ? -1 : 0;
  const d1 =
    (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
  return isCall ? normalCDF(d1) : normalCDF(d1) - 1;
}

export function invertIV(S, K, T, r, marketPrice, isCall) {
  let low = 0.001,
    high = 10.0;
  for (let i = 0; i < 100; i++) {
    const mid = (low + high) / 2;
    const price = bsmPrice(S, K, T, r, mid, isCall);
    if (Math.abs(price - marketPrice) < 0.0001) return mid;
    if (price < marketPrice) low = mid;
    else high = mid;
  }
  return null;
}

export function findDeltaStrike(
  strikes,
  S,
  T,
  r,
  targetDelta,
  isCall,
  sigmaEstimate,
) {
  let bestStrike = null,
    bestDiff = Infinity;
  for (const K of strikes) {
    const delta = bsmDelta(S, K, T, r, sigmaEstimate, isCall);
    const diff = Math.abs(Math.abs(delta) - Math.abs(targetDelta));
    if (diff < bestDiff) {
      bestDiff = diff;
      bestStrike = K;
    }
  }
  return bestStrike;
}

export function findTargetExpiry(allOptions, targetDays) {
  const today = new Date();
  const expirations = [...new Set(allOptions.map((o) => o["expiration-date"]))];
  let bestExpiry = null,
    bestDiff = Infinity;
  for (const exp of expirations) {
    const expDate = new Date(exp);
    const days = (expDate - today) / (1000 * 60 * 60 * 24);
    const diff = Math.abs(days - targetDays);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestExpiry = exp;
    }
  }
  return bestExpiry;
}

export function isValidQuote(q) {
  if (!q) return false;
  if (q.bidPrice <= 0) return false;
  if (q.askPrice <= q.bidPrice) return false;
  const mid = (q.bidPrice + q.askPrice) / 2;
  const spread = q.askPrice - q.bidPrice;
  if (spread / mid > 0.5) return false;
  return true;
}
