import { client } from "./clients.mjs";
import { nowCT } from "./market-hours.mjs";

export function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout: ${label}`)), ms),
    ),
  ]);
}

export async function getQuotes(symbols) {
  const quotes = {};
  await withTimeout(
    new Promise((resolve) => {
      const listener = (events) => {
        events.forEach((e) => {
          if (symbols.includes(e.eventSymbol) && e.eventType === "Quote") {
            quotes[e.eventSymbol] = e;
          }
        });
        if (Object.keys(quotes).length === symbols.length) {
          client.quoteStreamer.removeEventListener(listener);
          client.quoteStreamer.unsubscribe(symbols);
          resolve();
        }
      };
      client.quoteStreamer.addEventListener(listener);
      client.quoteStreamer.subscribe(symbols);
    }),
    15000,
    `quotes for ${symbols.join(",")}`,
  );
  return quotes;
}

export async function getSpxOpenPrice() {
  return await withTimeout(
    new Promise((resolve) => {
      let openPrice = null;
      let quoteMid = null;
      const listener = (events) => {
        events.forEach((e) => {
          if (e.eventSymbol !== "SPX") return;
          if (e.eventType === "Summary" && e.openPrice && e.openPrice > 0) {
            openPrice = e.openPrice;
          }
          if (e.eventType === "Quote" && e.bidPrice && e.askPrice) {
            quoteMid = (e.bidPrice + e.askPrice) / 2;
          }
        });
        if (openPrice !== null || quoteMid !== null) {
          client.quoteStreamer.removeEventListener(listener);
          client.quoteStreamer.unsubscribe(["SPX"]);
          resolve({
            openPrice: openPrice ?? quoteMid,
            quoteMid: quoteMid ?? openPrice,
          });
        }
      };
      client.quoteStreamer.addEventListener(listener);
      client.quoteStreamer.subscribe(["SPX", "=SPX"]);
    }),
    15000,
    "SPX open price",
  );
}

export async function getSpxQuoteMid() {
  return await withTimeout(
    new Promise((resolve) => {
      const listener = (events) => {
        const spxQuote = events.find(
          (e) => e.eventSymbol === "SPX" && e.eventType === "Quote",
        );
        if (spxQuote) {
          client.quoteStreamer.removeEventListener(listener);
          client.quoteStreamer.unsubscribe(["SPX"]);
          resolve((spxQuote.bidPrice + spxQuote.askPrice) / 2);
        }
      };
      client.quoteStreamer.addEventListener(listener);
      client.quoteStreamer.subscribe(["SPX"]);
    }),
    15000,
    "SPX quote",
  );
}

export async function getEsMid(esSymbol) {
  try {
    return await withTimeout(
      new Promise((resolve) => {
        const listener = (events) => {
          const esQuote = events.find(
            (e) => e.eventSymbol === esSymbol && e.eventType === "Quote",
          );
          if (esQuote && esQuote.bidPrice > 0 && esQuote.askPrice > 0) {
            client.quoteStreamer.removeEventListener(listener);
            client.quoteStreamer.unsubscribe([esSymbol]);
            resolve((esQuote.bidPrice + esQuote.askPrice) / 2);
          }
        };
        client.quoteStreamer.addEventListener(listener);
        client.quoteStreamer.subscribe([esSymbol]);
      }),
      10000,
      "ES quote",
    );
  } catch {
    console.log(`[${nowCT()}] ES quote timeout/error — skipping.`);
    return null;
  }
}

// Collect OHLC for futures/equities (Quote events, bid/ask based)
// and for indices (Trade events, last price based)
// quoteSymbols: use Quote mid (ES, SPX etc)
// tradeSymbols: use Trade last (VIX, VIX1D etc)
export async function collectOhlc(quoteSymbols, tradeSymbols, durationMs) {
  const ohlc = {};

  function applyTick(sym, price) {
    if (!price || price <= 0) return;
    if (!ohlc[sym]) {
      ohlc[sym] = { open: price, high: price, low: price, close: price };
    } else {
      ohlc[sym].high = Math.max(ohlc[sym].high, price);
      ohlc[sym].low = Math.min(ohlc[sym].low, price);
      ohlc[sym].close = price;
    }
  }

  const allSymbols = [...quoteSymbols, ...tradeSymbols];
  const tradeSet = new Set(tradeSymbols);

  return new Promise((resolve) => {
    const listener = (events) => {
      events.forEach((e) => {
        if (!allSymbols.includes(e.eventSymbol)) return;

        if (tradeSet.has(e.eventSymbol)) {
          // Indices: use Trade event lastPrice
          if (e.eventType === "Trade" && e.price > 0) {
            applyTick(e.eventSymbol, e.price);
          }
        } else {
          // Futures/equities: use Quote mid
          if (e.eventType === "Quote" && e.bidPrice > 0 && e.askPrice > 0) {
            applyTick(e.eventSymbol, (e.bidPrice + e.askPrice) / 2);
          }
        }
      });
    };

    client.quoteStreamer.addEventListener(listener);
    client.quoteStreamer.subscribe(allSymbols);

    setTimeout(() => {
      client.quoteStreamer.removeEventListener(listener);
      client.quoteStreamer.unsubscribe(allSymbols);
      resolve(ohlc);
    }, durationMs);
  });
}

// Fetch last trade price for an index symbol (VIX, VIX1D etc)
// Uses Trade event — bid/ask are 0 for indices
export async function getIndexLast(symbol) {
  try {
    return await withTimeout(
      new Promise((resolve) => {
        const listener = (events) => {
          const trade = events.find(
            (e) =>
              e.eventSymbol === symbol &&
              e.eventType === "Trade" &&
              e.price > 0,
          );
          if (trade) {
            client.quoteStreamer.removeEventListener(listener);
            client.quoteStreamer.unsubscribe([symbol]);
            resolve(trade.price);
          }
        };
        client.quoteStreamer.addEventListener(listener);
        client.quoteStreamer.subscribe([symbol]);
      }),
      10000,
      `${symbol} last`,
    );
  } catch {
    console.log(`[${nowCT()}] ${symbol} Trade timeout/error — skipping.`);
    return null;
  }
}
