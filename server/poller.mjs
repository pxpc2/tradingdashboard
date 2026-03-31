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

// Tracks whether we've fired the special open cycle today
let openCycleFiredDate = null;

function shouldFireOpenCycle() {
  const day = getETDay();
  const time = getETTime();
  const today = getTodayET();

  if (["Sat", "Sun"].includes(day)) return false;
  if (openCycleFiredDate === today) return false; // already fired today
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

// Gets SPX open price from Summary event, falls back to Quote mid
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

        // Resolve as soon as we have either
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
      // Subscribe to both Quote and Summary
      client.quoteStreamer.subscribe(["SPX", "=SPX"]);
    }),
    15000,
    "SPX open price",
  );
}

// Gets SPX quote mid only (normal cycles)
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

    // For open cycle: use openPrice to find ATM strike
    // For normal cycles: use live quote mid
    let spxMid;
    let atmStrikePrice;

    if (isOpenCycle) {
      console.log(
        `[${nowCT()}] 🔔 Ciclo de abertura — buscando preço de abertura do SPX...`,
      );
      const { openPrice, quoteMid } = await getSpxOpenPrice();
      spxMid = quoteMid; // store live mid as spx_ref
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

    // Get straddle quotes
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
  // Check if we should fire the special open cycle
  if (shouldFireOpenCycle()) {
    openCycleFiredDate = getTodayET();
    console.log(`[${nowCT()}] 🔔 Disparando ciclo de abertura...`);
    await runCycle(true);
    // Reset the 60s timer from now
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
