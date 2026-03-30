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

let lastSkipLog = 0;

async function runCycle() {
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
      console.log(`[${nowCT()}] No SPXW options found for today, skipping.`);
      return;
    }

    const strikes = [
      ...new Set(todayOptions.map((o) => parseFloat(o["strike-price"]))),
    ].sort((a, b) => a - b);

    // Helper to find streamer symbol for a given strike and option type
    function getStreamerSymbol(strike, optType) {
      const opt = todayOptions.find(
        (o) =>
          parseFloat(o["strike-price"]) === strike &&
          o["option-type"] === optType.toUpperCase(),
      );
      return opt?.["streamer-symbol"] ?? null;
    }

    // Get SPX spot price
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
    const atmStrike = parseFloat(atmCall["strike-price"]);

    const { error: straddleError } = await withTimeout(
      supabase.from("straddle_snapshots").insert({
        spx_ref: spxMid,
        atm_strike: atmStrike,
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
        `[${nowCT()}] SPX ref: ${spxMid.toFixed(2)} | ATM: ${atmStrike} | Straddle: ${straddleMid.toFixed(2)}`,
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

    // Collect all unique strikes needed across all widths
    const flyStrikeSet = new Set();
    for (const width of sessionWidths) {
      flyStrikeSet.add(smlStrike - width);
      flyStrikeSet.add(smlStrike);
      flyStrikeSet.add(smlStrike + width);
    }
    const flyStrikes = [...flyStrikeSet];

    // Get streamer symbols for all fly strikes
    const flySymbols = flyStrikes
      .map((s) => getStreamerSymbol(s, optType))
      .filter(Boolean);

    if (flySymbols.length === 0) {
      console.log(`[${nowCT()}] No fly symbols found, skipping fly snapshots.`);
      return;
    }

    // Fetch all fly quotes in one batch
    const flyQuotes = await getQuotes(flySymbols);

    // Helper to get mid/bid/ask for a given strike
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

    // Compute and insert fly snapshot for each width
    for (const width of sessionWidths) {
      const lower = getFlyLegPrices(smlStrike - width);
      const center = getFlyLegPrices(smlStrike);
      const upper = getFlyLegPrices(smlStrike + width);

      if (!lower || !center || !upper) {
        console.log(`[${nowCT()}] Missing quotes for ${width}W fly, skipping.`);
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
  await runCycle();
  setTimeout(runAndScheduleNext, 60 * 1000);
}

console.log(`[${nowCT()}] Starting poller...`);
await client.quoteStreamer.connect();
console.log(`[${nowCT()}] DXLink connected.`);

runAndScheduleNext();

process.on("SIGINT", async () => {
  console.log(`\n[${nowCT()}] Shutting down...`);
  await client.quoteStreamer.disconnect();
  process.exit(0);
});
