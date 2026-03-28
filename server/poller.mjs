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

function isMarketHours() {
  const now = new Date();
  const day = now.toLocaleDateString("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
  });
  const time = now.toLocaleTimeString("en-US", {
    timeZone: "America/New_York",
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  if (["Sat", "Sun"].includes(day)) return false;
  if (time < "09:30:00" || time >= "16:00:00") return false;
  return true;
}

let lastSkipLog = 0;
async function runCycle() {
  if (!isMarketHours()) {
    const now = Date.now();
    if (now - lastSkipLog > 60 * 60 * 1000) {
      // only log once per hour
      console.log(`[${nowCT()}] Outside market hours, skipping.`);
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
      console.log(`[${nowCT()}] No SPXW options found for today, skipping.`);
      return;
    }

    const strikes = [
      ...new Set(todayOptions.map((o) => parseFloat(o["strike-price"]))),
    ].sort((a, b) => a - b);

    // Get SPX quote
    const { atmCall, atmPut, spxMid } = await withTimeout(
      new Promise((resolve) => {
        const spxListener = (events) => {
          const spxQuote = events.find(
            (e) => e.eventSymbol === "SPX" && e.eventType === "Quote",
          );
          if (spxQuote) {
            client.quoteStreamer.removeEventListener(spxListener);
            client.quoteStreamer.unsubscribe(["SPX"]);
            const spxMid = (spxQuote.bidPrice + spxQuote.askPrice) / 2;
            const atmStrike = strikes.reduce((prev, curr) =>
              Math.abs(curr - spxMid) < Math.abs(prev - spxMid) ? curr : prev,
            );
            const atmCall = todayOptions.find(
              (o) =>
                parseFloat(o["strike-price"]) === atmStrike &&
                o["option-type"] === "C",
            );
            const atmPut = todayOptions.find(
              (o) =>
                parseFloat(o["strike-price"]) === atmStrike &&
                o["option-type"] === "P",
            );
            resolve({ atmCall, atmPut, spxMid });
          }
        };
        client.quoteStreamer.addEventListener(spxListener);
        client.quoteStreamer.subscribe(["SPX"]);
      }),
      15000,
      "SPX quote",
    );

    // Get straddle quotes
    const straddleSymbols = [
      atmCall["streamer-symbol"],
      atmPut["streamer-symbol"],
    ];
    const quotes = {};

    await withTimeout(
      new Promise((resolve) => {
        const straddleListener = (events) => {
          events.forEach((e) => {
            if (
              straddleSymbols.includes(e.eventSymbol) &&
              e.eventType === "Quote"
            ) {
              quotes[e.eventSymbol] = e;
            }
          });
          if (Object.keys(quotes).length === 2) {
            client.quoteStreamer.removeEventListener(straddleListener);
            client.quoteStreamer.unsubscribe(straddleSymbols);
            resolve();
          }
        };
        client.quoteStreamer.addEventListener(straddleListener);
        client.quoteStreamer.subscribe(straddleSymbols);
      }),
      15000,
      "straddle quotes",
    );

    const callMid =
      (quotes[straddleSymbols[0]].bidPrice +
        quotes[straddleSymbols[0]].askPrice) /
      2;
    const putMid =
      (quotes[straddleSymbols[1]].bidPrice +
        quotes[straddleSymbols[1]].askPrice) /
      2;
    const straddleMid = callMid + putMid;
    const atmStrike = parseFloat(atmCall["strike-price"]);

    const { error } = await withTimeout(
      supabase.from("straddle_snapshots").insert({
        spx_ref: spxMid,
        atm_strike: atmStrike,
        call_bid: quotes[straddleSymbols[0]].bidPrice,
        call_ask: quotes[straddleSymbols[0]].askPrice,
        put_bid: quotes[straddleSymbols[1]].bidPrice,
        put_ask: quotes[straddleSymbols[1]].askPrice,
        straddle_mid: straddleMid,
      }),
      10000,
      "Supabase insert",
    );

    if (error) {
      console.error(`[${nowCT()}] Supabase error:`, error.message);
    } else {
      console.log(
        `[${nowCT()}] SPX ref: ${spxMid.toFixed(2)} | ATM strike: ${atmStrike} | Straddle: ${straddleMid.toFixed(2)}`,
      );
    }
  } catch (err) {
    console.error(`[${nowCT()}] Cycle error:`, err.message);
  }
}

async function runAndScheduleNext() {
  await runCycle();
  setTimeout(runAndScheduleNext, 60 * 1000);
}

// Connect once at startup, run cycles, disconnect on exit
console.log(`[${nowCT()}] Starting poller...`);
await client.quoteStreamer.connect();
console.log(`[${nowCT()}] DXLink connected.`);

runAndScheduleNext();

// Graceful shutdown on Ctrl+C
process.on("SIGINT", async () => {
  console.log(`\n[${nowCT()}] Shutting down...`);
  await client.quoteStreamer.disconnect();
  process.exit(0);
});
