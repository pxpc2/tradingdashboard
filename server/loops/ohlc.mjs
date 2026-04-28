import { supabase } from "../lib/clients.mjs";
import {
  nowCT,
  isMarketHours,
  isGlobexHours,
  msUntilNextMinute,
  currentBarTime,
} from "../lib/market-hours.mjs";
import { collectOhlc, withTimeout } from "../lib/dxfeed.mjs";
import { getFrontMonthEsSymbol } from "../lib/futures.mjs";

const COLLECT_MS = 55 * 1000;

const TRADE_SYMBOLS = ["VIX", "VIX1D"]; // use Trade last price

async function insertOhlc(table, barTime, ohlcData, closeField = "close") {
  const { open, high, low, close } = ohlcData;
  const payload = {
    bar_time: barTime,
    open,
    high,
    low,
    [closeField]: close,
  };
  const { error } = await withTimeout(
    supabase.from(table).insert(payload),
    10000,
    `${table} insert`,
  );
  if (error) {
    console.error(`[${nowCT()}] ${table} insert error:`, error.message);
  }
  return !error;
}

export async function runOhlcLoop() {
  const esOpen = isGlobexHours();
  const spxOpen = isMarketHours();

  if (!esOpen && !spxOpen) {
    // Nothing to collect — wait until next minute boundary
    setTimeout(runOhlcLoop, msUntilNextMinute());
    return;
  }

  const esSymbol = esOpen ? await getFrontMonthEsSymbol() : null;

  const quoteSymbols = [];
  if (esOpen && esSymbol) quoteSymbols.push(esSymbol);
  if (spxOpen) quoteSymbols.push("SPX");

  // Always collect VIX+VIX1D during any open session (globex or RTH)
  const tradeSymbols = [...TRADE_SYMBOLS];

  try {
    const barTime = currentBarTime(); // snapshot minute boundary before collecting
    const ohlc = await collectOhlc(quoteSymbols, tradeSymbols, COLLECT_MS);

    const insertions = [];

    if (esSymbol && ohlc[esSymbol]) {
      const { open, high, low, close } = ohlc[esSymbol];
      insertions.push(
        insertOhlc("es_snapshots", barTime, ohlc[esSymbol], "es_ref").then(
          (ok) => {
            if (ok)
              console.log(
                `[${nowCT()}] ES  | O:${open.toFixed(2)} H:${high.toFixed(2)} L:${low.toFixed(2)} C:${close.toFixed(2)}`,
              );
          },
        ),
      );
    }

    if (ohlc["SPX"]) {
      const { open, high, low, close } = ohlc["SPX"];
      insertions.push(
        insertOhlc("spx_snapshots", barTime, ohlc["SPX"]).then((ok) => {
          if (ok)
            console.log(
              `[${nowCT()}] SPX | O:${open.toFixed(2)} H:${high.toFixed(2)} L:${low.toFixed(2)} C:${close.toFixed(2)}`,
            );
        }),
      );
    }

    if (ohlc["VIX"]) {
      const { open, high, low, close } = ohlc["VIX"];
      insertions.push(
        insertOhlc("vix_snapshots", barTime, ohlc["VIX"]).then((ok) => {
          if (ok)
            console.log(
              `[${nowCT()}] VIX | O:${open.toFixed(2)} H:${high.toFixed(2)} L:${low.toFixed(2)} C:${close.toFixed(2)}`,
            );
        }),
      );
    }

    if (ohlc["VIX1D"]) {
      const { open, high, low, close } = ohlc["VIX1D"];
      insertions.push(
        insertOhlc("vix1d_snapshots", barTime, ohlc["VIX1D"]).then((ok) => {
          if (ok)
            console.log(
              `[${nowCT()}] VIX1D | O:${open.toFixed(2)} H:${high.toFixed(2)} L:${low.toFixed(2)} C:${close.toFixed(2)}`,
            );
        }),
      );
    }

    await Promise.all(insertions);
  } catch (err) {
    console.error(`[${nowCT()}] OHLC loop error:`, err.message);
  }

  // Anchor to next wall-clock minute boundary, minus 5s to start collecting early
  const msToNext = msUntilNextMinute();
  const delay = Math.max(msToNext - 5000, 1000); // start collecting 5s before next minute
  setTimeout(runOhlcLoop, delay);
}
