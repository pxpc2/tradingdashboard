import TastytradeClient from "@tastytrade/api";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY,
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

let openCycleFiredDate = null;

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

// Find strike closest to target delta given vol surface estimate
function findDeltaStrike(strikes, S, T, r, targetDelta, isCall, sigmaEstimate) {
  let bestStrike = null;
  let bestDiff = Infinity;
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

// Find expiry closest to target days out
function findTargetExpiry(allOptions, targetDays) {
  const today = new Date();
  const expirations = [...new Set(allOptions.map((o) => o["expiration-date"]))];
  let bestExpiry = null;
  let bestDiff = Infinity;
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

async function computeAndStoreSkew(allOptions, spxMid, atmIV) {
  try {
    const R = 0.05;
    const TARGET_DAYS = 30;

    // Find the expiry closest to 30 days out
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

    // Get all strikes for target expiry (both C and P)
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

    // Use ATM IV as vol estimate for delta finding
    // If atmIV not available yet, use a reasonable default
    const sigmaEstimate = atmIV > 0 ? atmIV : 0.15;

    // Find 25-delta put strike (below spot, target delta = -0.25)
    const putStrikes = strikes.filter((k) => k < spxMid);
    const put25Strike = findDeltaStrike(
      putStrikes,
      spxMid,
      T,
      R,
      -0.25,
      false,
      sigmaEstimate,
    );

    // Find 25-delta call strike (above spot, target delta = +0.25)
    const callStrikes = strikes.filter((k) => k > spxMid);
    const call25Strike = findDeltaStrike(
      callStrikes,
      spxMid,
      T,
      R,
      0.25,
      true,
      sigmaEstimate,
    );

    if (!put25Strike || !call25Strike) {
      console.log(`[${nowCT()}] Skew: strikes 25-delta não encontrados.`);
      return;
    }

    // Get streamer symbols for 25d put and call
    function getSkewSymbol(strike, optType) {
      const opt = expiryOptions.find(
        (o) =>
          parseFloat(o["strike-price"]) === strike &&
          o["option-type"] === optType,
      );
      return opt?.["streamer-symbol"] ?? null;
    }

    const put25Symbol = getSkewSymbol(put25Strike, "P");
    const call25Symbol = getSkewSymbol(call25Strike, "C");

    if (!put25Symbol || !call25Symbol) {
      console.log(`[${nowCT()}] Skew: símbolos não encontrados.`);
      return;
    }

    // Also get ATM strike for this expiry for ATM IV computation
    const atmStrikeForExpiry = strikes.reduce((prev, curr) =>
      Math.abs(curr - spxMid) < Math.abs(prev - spxMid) ? curr : prev,
    );
    const atmCallSymbol = getSkewSymbol(atmStrikeForExpiry, "C");
    const atmPutSymbol = getSkewSymbol(atmStrikeForExpiry, "P");

    const symbolsToFetch = [
      ...new Set(
        [put25Symbol, call25Symbol, atmCallSymbol, atmPutSymbol].filter(
          Boolean,
        ),
      ),
    ];

    // Fetch all quotes in one batch
    const skewQuotes = await getQuotes(symbolsToFetch);

    // Compute mids
    function getMid(symbol) {
      const q = skewQuotes[symbol];
      if (!q) return null;
      return (q.bidPrice + q.askPrice) / 2;
    }

    const put25Mid = getMid(put25Symbol);
    const call25Mid = getMid(call25Symbol);
    const atmCallMid = getMid(atmCallSymbol);
    const atmPutMid = getMid(atmPutSymbol);

    if (!put25Mid || !call25Mid || !atmCallMid || !atmPutMid) {
      console.log(`[${nowCT()}] Skew: quotes insuficientes.`);
      return;
    }

    // BSM invert to get IVs
    const putIV = invertIV(spxMid, put25Strike, T, R, put25Mid, false);
    const callIV = invertIV(spxMid, call25Strike, T, R, call25Mid, true);
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

    // Normalized skew
    const skew = computedAtmIV > 0 ? (putIV - callIV) / computedAtmIV : 0;

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
        `[${nowCT()}] Skew: ${skew.toFixed(4)} | Put IV: ${(putIV * 100).toFixed(1)}% | Call IV: ${(callIV * 100).toFixed(1)}% | ATM IV: ${(computedAtmIV * 100).toFixed(1)}% | Expiry: ${targetExpiry}`,
      );
    }
  } catch (err) {
    console.error(`[${nowCT()}] Skew error:`, err.message);
  }
}

let lastSkipLog = 0;

async function runCycle(isOpenCycle = false) {
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

    // Compute ATM IV from today's straddle for use in skew delta estimation
    const T0dte = 1 / 365;
    const atmIV = invertIV(
      spxMid,
      atmStrikePrice,
      T0dte,
      0.05,
      straddleMid / 2,
      true,
    );

    const { error: straddleError } = await withTimeout(
      supabase.from("straddle_snapshots").insert({
        spx_ref: spxMid,
        atm_strike: atmStrikePrice,
        call_bid: straddleQuotes[straddleSymbols[0]].bidPrice,
        call_ask: straddleQuotes[straddleSymbols[0]].askPrice,
        put_bid: straddleQuotes[straddleSymbols[1]].bidPrice,
        put_ask: straddleQuotes[straddleSymbols[1]].askPrice,
        straddle_mid: straddleMid,
      }),
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
        `[${nowCT()}] ${isOpenCycle ? "🔔 ABERTURA | " : ""}SPX ref: ${spxMid.toFixed(2)} | ATM: ${atmStrikePrice} | Straddle: ${straddleMid.toFixed(2)}`,
      );
    }

    // Compute and store skew using full options chain
    await computeAndStoreSkew(options, spxMid, atmIV);

    // Check for active RTM session today
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
    const flyStrikes = [...flyStrikeSet];

    const flySymbols = flyStrikes
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

runAndScheduleNext();

process.on("SIGINT", async () => {
  console.log(`\n[${nowCT()}] Desligando..`);
  await client.quoteStreamer.disconnect();
  process.exit(0);
});
