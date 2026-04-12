import { supabase } from "../lib/clients.mjs";
import { client } from "../lib/clients.mjs";
import {
  nowCT,
  getTodayET,
  getETDay,
  getETTime,
  isMarketHours,
  msUntilNextMinute,
} from "../lib/market-hours.mjs";
import {
  getQuotes,
  getSpxOpenPrice,
  getSpxQuoteMid,
  getEsMid,
  withTimeout,
} from "../lib/dxfeed.mjs";
import {
  invertIV,
  bsmDelta,
  findDeltaStrike,
  findTargetExpiry,
  isValidQuote,
} from "../lib/bsm.mjs";
import { ES_SYMBOL } from "./ohlc.mjs";

let openCycleFiredDate = null;
let skewCycleCount = 0;
let lastSkipLog = 0;

function shouldFireOpenCycle() {
  const day = getETDay();
  const time = getETTime();
  const today = getTodayET();
  if (["Sat", "Sun"].includes(day)) return false;
  if (openCycleFiredDate === today) return false;
  return time >= "09:30:00" && time <= "09:30:30";
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

      const esMid = await getEsMid(ES_SYMBOL);
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

    // SML Fly
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

export async function runAndScheduleNext() {
  if (shouldFireOpenCycle()) {
    openCycleFiredDate = getTodayET();
    skewCycleCount = 0;
    console.log(`[${nowCT()}] 🔔 Disparando ciclo de abertura...`);
    await runCycle(true);
  } else {
    await runCycle(false);
  }

  // Anchor to next wall-clock minute boundary
  setTimeout(runAndScheduleNext, msUntilNextMinute());
}
