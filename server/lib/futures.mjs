import { client } from "./clients.mjs";
import { nowCT } from "./market-hours.mjs";

const REFRESH_MS = 60 * 60 * 1000;
const ROLL_WARNING_DAYS = 7;

let cache = { symbol: null, expirationDate: null, fetchedAt: 0 };

async function fetchFrontMonthEsSymbol() {
  const futures = await client.instrumentsService.getFutures({
    symbols: ["/ES"],
  });
  const now = new Date();
  const active = (futures ?? [])
    .filter(
      (f) =>
        f["active"] === true &&
        new Date(f["expiration-date"]) > now &&
        f["future-product"]?.["root-symbol"] === "/ES",
    )
    .sort(
      (a, b) =>
        new Date(a["expiration-date"]).getTime() -
        new Date(b["expiration-date"]).getTime(),
    );
  const front = active[0];
  if (!front) {
    throw new Error("No active ES future found in Tastytrade response");
  }
  return {
    symbol: front["streamer-symbol"],
    expirationDate: front["expiration-date"],
  };
}

export async function getFrontMonthEsSymbol() {
  const now = Date.now();
  const ageMs = now - cache.fetchedAt;
  const expiresInDays = cache.expirationDate
    ? (new Date(cache.expirationDate).getTime() - now) / 86400000
    : Infinity;
  const stale =
    !cache.symbol ||
    ageMs > REFRESH_MS ||
    expiresInDays <= ROLL_WARNING_DAYS;

  if (!stale) return cache.symbol;

  try {
    const fresh = await fetchFrontMonthEsSymbol();
    if (cache.symbol && cache.symbol !== fresh.symbol) {
      console.log(
        `[${nowCT()}] ES contract rolled: ${cache.symbol} -> ${fresh.symbol}`,
      );
    }
    cache = { ...fresh, fetchedAt: now };
    return cache.symbol;
  } catch (err) {
    if (cache.symbol) {
      console.warn(
        `[${nowCT()}] ES front-month lookup failed, using cached ${cache.symbol}: ${err.message}`,
      );
      return cache.symbol;
    }
    throw err;
  }
}
