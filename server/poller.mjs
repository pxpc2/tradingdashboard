import TastytradeClient from "@tastytrade/api";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const client = new TastytradeClient({
  ...TastytradeClient.ProdConfig,
  clientSecret: process.env.CLIENT_SECRET,
  refreshToken: process.env.REFRESH_TOKEN,
  oauthScopes: ["read"],
});

function getTodayET() {
  return new Date().toLocaleDateString("en-CA", {
    timeZone: "America/New_York",
  });
}

function nowCT() {
  return new Date().toLocaleString("en-US", {
    timeZone: "America/Chicago",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout: ${label}`)), ms),
    ),
  ]);
}

function getETTime() {
  return new Date().toLocaleTimeString("en-US", {
    timeZone: "America/New_York",
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function getETDay() {
  return new Date().toLocaleDateString("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
  });
}

function isMarketHours() {
  const day = getETDay();
  const time = getETTime();
  if (["Sat", "Sun"].includes(day)) return false;
  if (time < "09:30:00" || time >= "16:00:00") return false;
  return true;
}

function isGlobexHours() {
  const day = getETDay();
  const time = getETTime();
  if (day === "Sat") return false;
  if (day === "Sun" && time < "18:00:00") return false;
  if (!["Sat", "Sun"].includes(day) && time >= "17:00:00" && time < "18:00:00")
    return false;
  return true;
}

let openCycleFiredDate = null;
let skewCycleCount = 0;

function shouldFireOpenCycle() {
  const day = getETDay();
  const time = getETTime();
  const today = getTodayET();
  if (["Sat", "Sun"].includes(day)) return false;
  if (openCycleFiredDate === today) return false;
  if (time >= "09:30:00" && time <= "09:30:30") return true;
  return false;
}

async function getQuotes(symbols) {
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

async function getSpxOpenPrice() {
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

async function getSpxQuoteMid() {
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

async function getEsMid() {
  const ES_SYMBOL = "/ESM26:XCME";
  try {
    return await withTimeout(
      new Promise((resolve) => {
        const listener = (events) => {
          const esQuote = events.find(
            (e) => e.eventSymbol === ES_SYMBOL && e.eventType === "Quote",
          );
          if (esQuote && esQuote.bidPrice > 0 && esQuote.askPrice > 0) {
            client.quoteStreamer.removeEventListener(listener);
            client.quoteStreamer.unsubscribe([ES_SYMBOL]);
            resolve((esQuote.bidPrice + esQuote.askPrice) / 2);
          }
        };
        client.quoteStreamer.addEventListener(listener);
        client.quoteStreamer.subscribe([ES_SYMBOL]);
      }),
      10000,
      "ES quote",
    );
  } catch (err) {
    console.log(`[${nowCT()}] ES quote timeout/error — skipping.`);
    return null;
  }
}

// ─── OHLC Collection ─────────────────────────────────────────────────────────

const ES_SYMBOL = "/ESM26:XCME";
const OHLC_WINDOW_MS = 55 * 1000; // collect for 55s, insert, repeat

async function collectOhlc(symbols, durationMs) {
  // Returns { [symbol]: { open, high, low, close } }
  const ohlc = {};

  return new Promise((resolve) => {
    const listener = (events) => {
      events.forEach((e) => {
        if (!symbols.includes(e.eventSymbol)) return;
        if (e.eventType !== "Quote") return;
        if (e.bidPrice <= 0 || e.askPrice <= 0) return;

        const mid = (e.bidPrice + e.askPrice) / 2;
        const sym = e.eventSymbol;

        if (!ohlc[sym]) {
          ohlc[sym] = { open: mid, high: mid, low: mid, close: mid };
        } else {
          ohlc[sym].high = Math.max(ohlc[sym].high, mid);
          ohlc[sym].low = Math.min(ohlc[sym].low, mid);
          ohlc[sym].close = mid;
        }
      });
    };

    client.quoteStreamer.addEventListener(listener);
    client.quoteStreamer.subscribe(symbols);

    setTimeout(() => {
      client.quoteStreamer.removeEventListener(listener);
      client.quoteStreamer.unsubscribe(symbols);
      resolve(ohlc);
    }, durationMs);
  });
}

async function runOhlcLoop() {
  const esOpen = isGlobexHours();
  const spxOpen = isMarketHours();

  if (!esOpen && !spxOpen) {
    // Nothing to collect — retry in 60s
    setTimeout(runOhlcLoop, 60 * 1000);
    return;
  }

  const symbolsToCollect = [];
  if (esOpen) symbolsToCollect.push(ES_SYMBOL);
  if (spxOpen) symbolsToCollect.push("SPX");

  try {
    const ohlc = await collectOhlc(symbolsToCollect, OHLC_WINDOW_MS);

    // Insert ES OHLC
    if (ohlc[ES_SYMBOL]) {
      const { open, high, low, close } = ohlc[ES_SYMBOL];
      const { error } = await withTimeout(
        supabase.from("es_snapshots").insert({
          es_ref: close,
          open,
          high,
          low,
        }),
        10000,
        "es ohlc insert",
      );
      if (error) {
        console.error(`[${nowCT()}] ES OHLC insert error:`, error.message);
      } else {
        console.log(
          `[${nowCT()}] ES OHLC | O:${open.toFixed(2)} H:${high.toFixed(2)} L:${low.toFixed(2)} C:${close.toFixed(2)}`,
        );
      }
    }

    // Insert SPX OHLC
    if (ohlc["SPX"]) {
      const { open, high, low, close } = ohlc["SPX"];
      const { error } = await withTimeout(
        supabase.from("spx_snapshots").insert({
          open,
          high,
          low,
          close,
        }),
        10000,
        "spx ohlc insert",
      );
      if (error) {
        console.error(`[${nowCT()}] SPX OHLC insert error:`, error.message);
      } else {
        console.log(
          `[${nowCT()}] SPX OHLC | O:${open.toFixed(2)} H:${high.toFixed(2)} L:${low.toFixed(2)} C:${close.toFixed(2)}`,
        );
      }
    }
  } catch (err) {
    console.error(`[${nowCT()}] OHLC loop error:`, err.message);
  }

  // Schedule next — 5s gap after the 55s collection window = ~60s total
  setTimeout(runOhlcLoop, 5 * 1000);
}

// ─────────────────────────────────────────────────────────────────────────────

// BSM helpers
function normalCDF(x) {
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

function bsmPrice(S, K, T, r, sigma, isCall) {
  if (T <= 0) return Math.max(0, isCall ? S - K : K - S);
  const d1 =
    (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
  const d2 = d1 - sigma * Math.sqrt(T);
  if (isCall) return S * normalCDF(d1) - K * Math.exp(-r * T) * normalCDF(d2);
  return K * Math.exp(-r * T) * normalCDF(-d2) - S * normalCDF(-d1);
}

function bsmDelta(S, K, T, r, sigma, isCall) {
  if (T <= 0) return isCall ? (S > K ? 1 : 0) : S < K ? -1 : 0;
  const d1 =
    (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
  return isCall ? normalCDF(d1) : normalCDF(d1) - 1;
}

function invertIV(S, K, T, r, marketPrice, isCall) {
  let low = 0.001,
    high = 10.0,
    iv = 0.5;
  for (let i = 0; i < 100; i++) {
    const mid = (low + high) / 2;
    const price = bsmPrice(S, K, T, r, mid, isCall);
    if (Math.abs(price - marketPrice) < 0.0001) {
      iv = mid;
      break;
    }
    if (price < marketPrice) low = mid;
    else high = mid;
    iv = mid;
  }
  return iv;
}

function findDeltaStrike(strikes, S, T, r, targetDelta, isCall, sigmaEstimate) {
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

function findTargetExpiry(allOptions, targetDays) {
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

function isValidQuote(q) {
  if (!q) return false;
  if (q.bidPrice <= 0) return false;
  if (q.askPrice <= q.bidPrice) return false;
  const mid = (q.bidPrice + q.askPrice) / 2;
  const spread = q.askPrice - q.bidPrice;
  if (spread / mid > 0.5) return false;
  return true;
}

async function computeAndStoreSkew(allOptions, spxMid) {
  try {
    const R = 0.05;
    const TARGET_DAYS = 30;
    const targetExpiry = findTargetExpiry(allOptions, TARGET_DAYS);
    if (!targetExpiry) {
      console.log(`[${nowCT()}] Skew: nenhum vencimento encontrado.`);
      return;
    }

    const expiryDate = new Date(targetExpiry);
    const today = new Date();
    const T = Math.max(
      (expiryDate - today) / (1000 * 60 * 60 * 24 * 365),
      0.001,
    );

    const expiryOptions = allOptions.filter(
      (o) => o["expiration-date"] === targetExpiry,
    );
    const strikes = [
      ...new Set(expiryOptions.map((o) => parseFloat(o["strike-price"]))),
    ].sort((a, b) => a - b);

    if (strikes.length === 0) {
      console.log(
        `[${nowCT()}] Skew: nenhum strike encontrado para ${targetExpiry}.`,
      );
      return;
    }

    function getSkewSymbol(strike, optType) {
      const opt = expiryOptions.find(
        (o) =>
          parseFloat(o["strike-price"]) === strike &&
          o["option-type"] === optType,
      );
      return opt?.["streamer-symbol"] ?? null;
    }

    const atmStrikeForExpiry = strikes.reduce((prev, curr) =>
      Math.abs(curr - spxMid) < Math.abs(prev - spxMid) ? curr : prev,
    );
    const atmCallSymbol = getSkewSymbol(atmStrikeForExpiry, "C");
    const atmPutSymbol = getSkewSymbol(atmStrikeForExpiry, "P");

    if (!atmCallSymbol || !atmPutSymbol) {
      console.log(`[${nowCT()}] Skew: símbolos ATM não encontrados.`);
      return;
    }

    const atmQuotes = await getQuotes([atmCallSymbol, atmPutSymbol]);
    const atmCallQ = atmQuotes[atmCallSymbol];
    const atmPutQ = atmQuotes[atmPutSymbol];

    if (!isValidQuote(atmCallQ) || !isValidQuote(atmPutQ)) {
      console.log(`[${nowCT()}] Skew: quotes ATM inválidas, abortando.`);
      return;
    }

    const atmCallMid = (atmCallQ.bidPrice + atmCallQ.askPrice) / 2;
    const atmPutMid = (atmPutQ.bidPrice + atmPutQ.askPrice) / 2;
    const atmCallIV = invertIV(
      spxMid,
      atmStrikeForExpiry,
      T,
      R,
      atmCallMid,
      true,
    );
    const atmPutIV = invertIV(
      spxMid,
      atmStrikeForExpiry,
      T,
      R,
      atmPutMid,
      false,
    );
    const computedAtmIV = (atmCallIV + atmPutIV) / 2;

    if (computedAtmIV <= 0 || computedAtmIV > 2.0) {
      console.log(
        `[${nowCT()}] Skew: ATM IV inválida (${computedAtmIV.toFixed(4)}), abortando.`,
      );
      return;
    }

    const putStrikes = strikes.filter((k) => k < spxMid);
    const callStrikes = strikes.filter((k) => k > spxMid);
    const put25Strike = findDeltaStrike(
      putStrikes,
      spxMid,
      T,
      R,
      -0.25,
      false,
      computedAtmIV,
    );
    const call25Strike = findDeltaStrike(
      callStrikes,
      spxMid,
      T,
      R,
      0.25,
      true,
      computedAtmIV,
    );

    if (!put25Strike || !call25Strike) {
      console.log(`[${nowCT()}] Skew: strikes 25-delta não encontrados.`);
      return;
    }

    const put25Symbol = getSkewSymbol(put25Strike, "P");
    const call25Symbol = getSkewSymbol(call25Strike, "C");

    if (!put25Symbol || !call25Symbol) {
      console.log(`[${nowCT()}] Skew: símbolos 25-delta não encontrados.`);
      return;
    }

    const wingQuotes = await getQuotes([put25Symbol, call25Symbol]);
    const put25Q = wingQuotes[put25Symbol];
    const call25Q = wingQuotes[call25Symbol];

    if (!isValidQuote(put25Q) || !isValidQuote(call25Q)) {
      console.log(`[${nowCT()}] Skew: quotes 25-delta inválidas, abortando.`);
      return;
    }

    const put25Mid = (put25Q.bidPrice + put25Q.askPrice) / 2;
    const call25Mid = (call25Q.bidPrice + call25Q.askPrice) / 2;
    const putIV = invertIV(spxMid, put25Strike, T, R, put25Mid, false);
    const callIV = invertIV(spxMid, call25Strike, T, R, call25Mid, true);

    if (
      putIV <= 0 ||
      putIV > 1.5 ||
      callIV <= 0 ||
      callIV > 1.5 ||
      computedAtmIV <= 0 ||
      computedAtmIV > 1.5
    ) {
      console.log(
        `[${nowCT()}] Skew: IVs fora do intervalo esperado. Descartando.`,
      );
      return;
    }

    const skew = (putIV - callIV) / computedAtmIV;
    if (skew < 0 || skew > 2.0) {
      console.log(
        `[${nowCT()}] Skew: valor final fora do intervalo (${skew.toFixed(4)}). Descartando.`,
      );
      return;
    }

    const { error } = await withTimeout(
      supabase.from("skew_snapshots").insert({
        skew,
        put_iv: putIV,
        call_iv: callIV,
        atm_iv: computedAtmIV,
        expiration_date: targetExpiry,
        put_strike: put25Strike,
        call_strike: call25Strike,
      }),
      10000,
      "skew insert",
    );

    if (error) {
      console.error(`[${nowCT()}] Skew insert error:`, error.message);
    } else {
      console.log(
        `[${nowCT()}] Skew: ${skew.toFixed(4)} | Put IV: ${(putIV * 100).toFixed(1)}% | Call IV: ${(callIV * 100).toFixed(1)}% | ATM IV: ${(computedAtmIV * 100).toFixed(1)}% | Expiry: ${targetExpiry} | Strikes: ${put25Strike}P / ${call25Strike}C`,
      );
    }
  } catch (err) {
    console.error(`[${nowCT()}] Skew error:`, err.message);
  }
}

let lastSkipLog = 0;

async function runCycle(isOpenCycle = false) {
  // SPX/options logic only during market hours
  if (!isMarketHours()) {
    const now = Date.now();
    if (now - lastSkipLog > 60 * 60 * 1000) {
      console.log(`[${nowCT()}] SPX fechado, tentaremos mais tarde.`);
      lastSkipLog = now;
    }
    return;
  }

  try {
    const chain = await client.instrumentsService.getOptionChain("%2FSPX");
    const options = Array.from(chain);
    const today = getTodayET();

    const todayOptions = options.filter(
      (o) => o["expiration-date"] === today && o["root-symbol"] === "SPXW",
    );

    if (todayOptions.length === 0) {
      console.log(
        `[${nowCT()}] Nenhuma opção SPXW encontrada, tentaremos mais tarde.`,
      );
      return;
    }

    const strikes = [
      ...new Set(todayOptions.map((o) => parseFloat(o["strike-price"]))),
    ].sort((a, b) => a - b);

    function getStreamerSymbol(strike, optType) {
      const opt = todayOptions.find(
        (o) =>
          parseFloat(o["strike-price"]) === strike &&
          o["option-type"] === optType.toUpperCase(),
      );
      return opt?.["streamer-symbol"] ?? null;
    }

    let spxMid;
    let atmStrikePrice;
    let esBasis = null;

    if (isOpenCycle) {
      console.log(
        `[${nowCT()}] 🔔 Ciclo de abertura — buscando preço de abertura do SPX...`,
      );
      const { openPrice, quoteMid } = await getSpxOpenPrice();
      spxMid = quoteMid;
      atmStrikePrice = strikes.reduce((prev, curr) =>
        Math.abs(curr - openPrice) < Math.abs(prev - openPrice) ? curr : prev,
      );
      console.log(
        `[${nowCT()}] SPX open price: ${openPrice?.toFixed(2)} | ATM strike: ${atmStrikePrice}`,
      );

      const esMid = await getEsMid();
      if (esMid !== null && spxMid > 0) {
        esBasis = parseFloat((esMid - spxMid).toFixed(2));
        console.log(
          `[${nowCT()}] ES mid: ${esMid.toFixed(2)} | SPX mid: ${spxMid.toFixed(2)} | Basis: ${esBasis}`,
        );
      }
    } else {
      spxMid = await getSpxQuoteMid();
      atmStrikePrice = strikes.reduce((prev, curr) =>
        Math.abs(curr - spxMid) < Math.abs(prev - spxMid) ? curr : prev,
      );
    }

    const atmCall = todayOptions.find(
      (o) =>
        parseFloat(o["strike-price"]) === atmStrikePrice &&
        o["option-type"] === "C",
    );
    const atmPut = todayOptions.find(
      (o) =>
        parseFloat(o["strike-price"]) === atmStrikePrice &&
        o["option-type"] === "P",
    );

    if (!atmCall || !atmPut) {
      console.log(
        `[${nowCT()}] ATM call/put não encontrados para strike ${atmStrikePrice}.`,
      );
      return;
    }

    const straddleSymbols = [
      atmCall["streamer-symbol"],
      atmPut["streamer-symbol"],
    ];
    const straddleQuotes = await getQuotes(straddleSymbols);

    const callMid =
      (straddleQuotes[straddleSymbols[0]].bidPrice +
        straddleQuotes[straddleSymbols[0]].askPrice) /
      2;
    const putMid =
      (straddleQuotes[straddleSymbols[1]].bidPrice +
        straddleQuotes[straddleSymbols[1]].askPrice) /
      2;
    const straddleMid = callMid + putMid;

    const straddlePayload = {
      spx_ref: spxMid,
      atm_strike: atmStrikePrice,
      call_bid: straddleQuotes[straddleSymbols[0]].bidPrice,
      call_ask: straddleQuotes[straddleSymbols[0]].askPrice,
      put_bid: straddleQuotes[straddleSymbols[1]].bidPrice,
      put_ask: straddleQuotes[straddleSymbols[1]].askPrice,
      straddle_mid: straddleMid,
      ...(isOpenCycle && esBasis !== null ? { es_basis: esBasis } : {}),
    };

    const { error: straddleError } = await withTimeout(
      supabase.from("straddle_snapshots").insert(straddlePayload),
      10000,
      "straddle insert",
    );

    if (straddleError) {
      console.error(
        `[${nowCT()}] Straddle insert error:`,
        straddleError.message,
      );
    } else {
      console.log(
        `[${nowCT()}] ${isOpenCycle ? "🔔 ABERTURA | " : ""}SPX ref: ${spxMid.toFixed(2)} | ATM: ${atmStrikePrice} | Straddle: ${straddleMid.toFixed(2)}${esBasis !== null ? ` | ES basis: ${esBasis}` : ""}`,
      );
    }

    skewCycleCount++;
    if (skewCycleCount % 5 === 0) {
      await computeAndStoreSkew(options, spxMid);
    }

    const { data: sessions } = await supabase
      .from("rtm_sessions")
      .select("*")
      .gte("created_at", `${today}T00:00:00`)
      .lt("created_at", `${today}T23:59:59`)
      .order("created_at", { ascending: false })
      .limit(1);

    const session = sessions?.[0] ?? null;
    if (!session) return;

    const smlStrike = session.sml_ref;
    const sessionWidths = session.widths ?? [];
    const optType = session.type === "put" ? "P" : "C";

    if (!smlStrike || sessionWidths.length === 0) return;

    const flyStrikeSet = new Set();
    for (const width of sessionWidths) {
      flyStrikeSet.add(smlStrike - width);
      flyStrikeSet.add(smlStrike);
      flyStrikeSet.add(smlStrike + width);
    }

    const flySymbols = [...flyStrikeSet]
      .map((s) => getStreamerSymbol(s, optType))
      .filter(Boolean);

    if (flySymbols.length === 0) {
      console.log(
        `[${nowCT()}] Nenhum 'fly symbol' encontrado, tentaremos mais tarde.`,
      );
      return;
    }

    const flyQuotes = await getQuotes(flySymbols);

    function getFlyLegPrices(strike) {
      const symbol = getStreamerSymbol(strike, optType);
      const quote = flyQuotes[symbol];
      if (!quote) return null;
      return {
        bid: quote.bidPrice,
        ask: quote.askPrice,
        mid: (quote.bidPrice + quote.askPrice) / 2,
      };
    }

    for (const width of sessionWidths) {
      const lower = getFlyLegPrices(smlStrike - width);
      const center = getFlyLegPrices(smlStrike);
      const upper = getFlyLegPrices(smlStrike + width);

      if (!lower || !center || !upper) {
        console.log(
          `[${nowCT()}] Quotes para ${width}W fly não encontradas, tentaremos mais tarde.`,
        );
        continue;
      }

      const flyMid = lower.mid + upper.mid - 2 * center.mid;
      const flyBid = lower.bid + upper.bid - 2 * center.ask;
      const flyAsk = lower.ask + upper.ask - 2 * center.bid;

      const { error: flyError } = await withTimeout(
        supabase.from("sml_fly_snapshots").insert({
          session_id: session.id,
          width,
          mid: flyMid,
          bid: flyBid,
          ask: flyAsk,
        }),
        10000,
        `fly insert ${width}W`,
      );

      if (flyError) {
        console.error(
          `[${nowCT()}] Fly insert error (${width}W):`,
          flyError.message,
        );
      } else {
        console.log(
          `[${nowCT()}] Fly ${width}W | bid: ${flyBid.toFixed(2)} | mid: ${flyMid.toFixed(2)} | ask: ${flyAsk.toFixed(2)}`,
        );
      }
    }
  } catch (err) {
    console.error(`[${nowCT()}] Cycle error:`, err.message);
  }
}

async function runAndScheduleNext() {
  if (shouldFireOpenCycle()) {
    openCycleFiredDate = getTodayET();
    skewCycleCount = 0;
    console.log(`[${nowCT()}] 🔔 Disparando ciclo de abertura...`);
    await runCycle(true);
    setTimeout(runAndScheduleNext, 60 * 1000);
    return;
  }

  await runCycle(false);
  setTimeout(runAndScheduleNext, 60 * 1000);
}

console.log(`[${nowCT()}] Inicializando servidor...`);
await client.quoteStreamer.connect();
console.log(`[${nowCT()}] DXLink conectado com sucesso.`);

// Start both loops independently
runAndScheduleNext();
runOhlcLoop();

process.on("SIGINT", async () => {
  console.log(`\n[${nowCT()}] Desligando..`);
  await client.quoteStreamer.disconnect();
  process.exit(0);
});
