import TastytradeClient from "@tastytrade/api";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
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
      setTimeout(() => reject(new Error(`Timeout: ${label}`)), ms)
    ),
  ]);
}

async function runCycle() {
  try {
    const chain = await client.instrumentsService.getOptionChain("%2FSPX");
    const options = Array.from(chain);
    const today = getTodayET();

    const todayOptions = options.filter(
      (o) => o["expiration-date"] === today && o["root-symbol"] === "SPXW"
    );

    if (todayOptions.length === 0) {
      console.log(`[${nowCT()}] No SPXW options found for today, skipping.`);
      return;
    }

    const strikes = [
      ...new Set(todayOptions.map((o) => parseFloat(o["strike-price"]))),
    ].sort((a, b) => a - b);

    await client.quoteStreamer.connect();

    const { atmCall, atmPut, spxMid } = await withTimeout(
      new Promise((resolve) => {
        client.quoteStreamer.addEventListener((events) => {
          const spxQuote = events.find(
            (e) => e.eventSymbol === "SPX" && e.eventType === "Quote"
          );
          if (spxQuote) {
            const spxMid = (spxQuote.bidPrice + spxQuote.askPrice) / 2;
            const atmStrike = strikes.reduce((prev, curr) =>
              Math.abs(curr - spxMid) < Math.abs(prev - spxMid) ? curr : prev
            );
            const atmCall = todayOptions.find(
              (o) =>
                parseFloat(o["strike-price"]) === atmStrike &&
                o["option-type"] === "C"
            );
            const atmPut = todayOptions.find(
              (o) =>
                parseFloat(o["strike-price"]) === atmStrike &&
                o["option-type"] === "P"
            );
            resolve({ atmCall, atmPut, spxMid });
          }
        });
        client.quoteStreamer.subscribe(["SPX"]);
      }),
      15000,
      "SPX quote"
    );

    const straddleSymbols = [
      atmCall["streamer-symbol"],
      atmPut["streamer-symbol"],
    ];
    const quotes = {};

    await withTimeout(
      new Promise((resolve) => {
        client.quoteStreamer.addEventListener((events) => {
          events.forEach((e) => {
            if (
              straddleSymbols.includes(e.eventSymbol) &&
              e.eventType === "Quote"
            ) {
              quotes[e.eventSymbol] = e;
            }
          });
          if (Object.keys(quotes).length === 2) resolve();
        });
        client.quoteStreamer.subscribe(straddleSymbols);
      }),
      15000,
      "straddle quotes"
    );

    await client.quoteStreamer.disconnect();

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
      "Supabase insert"
    );

    if (error) {
      console.error(`[${nowCT()}] Supabase error:`, error.message);
    } else {
      console.log(
        `[${nowCT()}] SPX ref: ${spxMid.toFixed(
          2
        )} | ATM strike: ${atmStrike} | Straddle: ${straddleMid.toFixed(2)}`
      );
    }
  } catch (err) {
    console.error(`[${nowCT()}] Cycle error:`, err.message);
    try {
      await client.quoteStreamer.disconnect();
    } catch {}
  }
}

async function runAndScheduleNext() {
  await runCycle();
  setTimeout(runAndScheduleNext, 60 * 1000);
}

runAndScheduleNext();
