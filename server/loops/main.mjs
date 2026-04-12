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
  getIndexLast,
  withTimeout,
} from "../lib/dxfeed.mjs";
import {
  invertIV,
  findDeltaStrike,
  findTargetExpiry,
  isValidQuote,
} from "../lib/bsm.mjs";
import { ES_SYMBOL } from "./ohlc.mjs";

let openCycleFiredDate = null;
let closeCycleFiredDate = null;
let weeklyOpenCycleFiredDate = null;
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

function shouldFireCloseCycle() {
  const day = getETDay();
  const time = getETTime();
  const today = getTodayET();
  if (["Sat", "Sun"].includes(day)) return false;
  if (closeCycleFiredDate === today) return false;
  return time >= "16:00:00" && time <= "16:01:00";
}

// Weekly straddle fires on Monday open cycle only, once per week
function shouldFireWeeklyOpenCycle() {
  const day = getETDay();
  const today = getTodayET();
  if (day !== "Mon") return false;
  if (weeklyOpenCycleFiredDate === today) return false;
  return true;
}

// ─── FMP helpers ─────────────────────────────────────────────────────────────

async function getFmpOpenPrice() {
  try {
    const todayET = getTodayET();
    const url = `https://financialmodelingprep.com/api/v3/historical-chart/1min/%5ESPX?apikey=${process.env.FMP_API_KEY}&limit=5`;
    const res = await withTimeout(fetch(url), 8000, "FMP open price");
    const json = await res.json();
    if (!Array.isArray(json)) return null;
    const openBar = json.find((bar) => {
      if (!bar.date) return false;
      const barDay = bar.date.slice(0, 10);
      const barTime = bar.date.slice(11, 16);
      return barDay === todayET && barTime === "09:30";
    });
    return openBar ?? null;
  } catch (err) {
    console.log(`[${nowCT()}]    FMP fetch failed: ${err.message}`);
    return null;
  }
}

async function hasHighImpactMacro(dateET) {
  try {
    const url = `https://financialmodelingprep.com/api/v3/economic_calendar?from=${dateET}&to=${dateET}&apikey=${process.env.FMP_API_KEY}`;
    const res = await withTimeout(fetch(url), 8000, "FMP macro events");
    const json = await res.json();
    return (
      Array.isArray(json) &&
      json.some((e) => e.impact === "High" && e.country === "US")
    );
  } catch {
    return false;
  }
}

// ─── Weekly Straddle ─────────────────────────────────────────────────────────

function findNearestFriday() {
  const now = new Date();
  const etNow = new Date(
    now.toLocaleString("en-US", { timeZone: "America/New_York" }),
  );
  const day = etNow.getDay(); // 0=Sun, 1=Mon, ..., 5=Fri
  const daysUntilFriday = (5 - day + 7) % 7 || 7; // if today is Friday, get next Friday
  const friday = new Date(etNow);
  friday.setDate(etNow.getDate() + daysUntilFriday);
  return friday.toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}

async function captureWeeklyStraddle(options, spxMid) {
  try {
    const targetFriday = findNearestFriday();
    console.log(
      `[${nowCT()}] 📅 Weekly straddle — target expiry: ${targetFriday}`,
    );

    // Find SPXW options expiring on that Friday
    const weeklyOptions = options.filter(
      (o) =>
        o["expiration-date"] === targetFriday && o["root-symbol"] === "SPXW",
    );

    if (weeklyOptions.length === 0) {
      console.log(
        `[${nowCT()}] Weekly straddle: no SPXW options found for ${targetFriday}.`,
      );
      return;
    }

    const strikes = [
      ...new Set(weeklyOptions.map((o) => parseFloat(o["strike-price"]))),
    ].sort((a, b) => a - b);

    const atmStrike = strikes.reduce((prev, curr) =>
      Math.abs(curr - spxMid) < Math.abs(prev - spxMid) ? curr : prev,
    );

    function getWeeklySymbol(strike, optType) {
      const opt = weeklyOptions.find(
        (o) =>
          parseFloat(o["strike-price"]) === strike &&
          o["option-type"] === optType,
      );
      return opt?.["streamer-symbol"] ?? null;
    }

    const callSymbol = getWeeklySymbol(atmStrike, "C");
    const putSymbol = getWeeklySymbol(atmStrike, "P");

    if (!callSymbol || !putSymbol) {
      console.log(
        `[${nowCT()}] Weekly straddle: ATM symbols not found for strike ${atmStrike}.`,
      );
      return;
    }

    const quotes = await getQuotes([callSymbol, putSymbol]);
    const callQ = quotes[callSymbol];
    const putQ = quotes[putSymbol];

    if (!isValidQuote(callQ) || !isValidQuote(putQ)) {
      console.log(`[${nowCT()}] Weekly straddle: invalid quotes, aborting.`);
      return;
    }

    const callMid = (callQ.bidPrice + callQ.askPrice) / 2;
    const putMid = (putQ.bidPrice + putQ.askPrice) / 2;
    const straddleMid = callMid + putMid;

    const { error } = await withTimeout(
      supabase.from("weekly_straddle_snapshots").insert({
        expiry_date: targetFriday,
        spx_ref: spxMid,
        atm_strike: atmStrike,
        call_bid: callQ.bidPrice,
        call_ask: callQ.askPrice,
        put_bid: putQ.bidPrice,
        put_ask: putQ.askPrice,
        straddle_mid: straddleMid,
      }),
      10000,
      "weekly straddle insert",
    );

    if (error) {
      console.error(
        `[${nowCT()}] Weekly straddle insert error:`,
        error.message,
      );
    } else {
      console.log(
        `[${nowCT()}] 📅 Weekly straddle | expiry: ${targetFriday} | SPX: ${spxMid.toFixed(2)} | ATM: ${atmStrike} | straddle: ${straddleMid.toFixed(2)}`,
      );
    }
  } catch (err) {
    console.error(`[${nowCT()}] captureWeeklyStraddle error:`, err.message);
  }
}

// ─── Session Summary ──────────────────────────────────────────────────────────

async function writeOpenSummary({
  today,
  spxMid,
  atmStrike,
  straddleMid,
  esBasis,
}) {
  try {
    const [vix, vix1d] = await Promise.all([
      getIndexLast("VIX"),
      getIndexLast("VIX1D"),
    ]);

    const vix1dVixRatio =
      vix && vix1d && vix > 0 ? parseFloat((vix1d / vix).toFixed(4)) : null;

    const highImpact = await hasHighImpactMacro(today);

    const dayOfWeek = new Date().toLocaleDateString("en-US", {
      timeZone: "America/New_York",
      weekday: "long",
    });

    const { data: skewRows } = await supabase
      .from("skew_snapshots")
      .select("skew, put_iv, call_iv, atm_iv")
      .gte("created_at", `${today}T00:00:00`)
      .lt("created_at", `${today}T23:59:59`)
      .order("created_at", { ascending: true })
      .limit(1);
    const skewRow = skewRows?.[0] ?? null;

    const { error } = await withTimeout(
      supabase.from("session_summary").upsert(
        {
          date: today,
          opening_spx: spxMid,
          opening_atm_strike: atmStrike,
          opening_straddle: straddleMid,
          opening_skew: skewRow?.skew ?? null,
          opening_put_iv: skewRow?.put_iv ?? null,
          opening_call_iv: skewRow?.call_iv ?? null,
          opening_atm_iv: skewRow?.atm_iv ?? null,
          opening_vix: vix,
          opening_vix1d: vix1d,
          opening_vix1d_vix_ratio: vix1dVixRatio,
          opening_es_basis: esBasis,
          has_high_impact_macro: highImpact,
          day_of_week: dayOfWeek,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "date" },
      ),
      10000,
      "session_summary open upsert",
    );

    if (error) {
      console.error(`[${nowCT()}] session_summary open error:`, error.message);
    } else {
      console.log(
        `[${nowCT()}] 📋 Open summary | VIX: ${vix?.toFixed(2)} | VIX1D: ${vix1d?.toFixed(2)} | ratio: ${vix1dVixRatio} | macro: ${highImpact} | day: ${dayOfWeek}`,
      );
    }
  } catch (err) {
    console.error(`[${nowCT()}] writeOpenSummary error:`, err.message);
  }
}

async function writeCloseSummary(today) {
  try {
    const { data: straddleRows } = await supabase
      .from("straddle_snapshots")
      .select("spx_ref, straddle_mid, created_at")
      .gte("created_at", `${today}T00:00:00`)
      .lt("created_at", `${today}T23:59:59`)
      .order("created_at", { ascending: true });

    if (!straddleRows || straddleRows.length === 0) {
      console.log(`[${nowCT()}] writeCloseSummary: no straddle rows found.`);
      return;
    }

    const opening = straddleRows[0];
    const closing = straddleRows[straddleRows.length - 1];
    const openSpx = opening.spx_ref;
    const closeSpx = closing.spx_ref;
    const openStraddle = opening.straddle_mid;

    const realizedMovePts = Math.abs(closeSpx - openSpx);
    const realizedMovePct =
      openStraddle > 0
        ? parseFloat(((realizedMovePts / openStraddle) * 100).toFixed(1))
        : null;

    const maxSpx = Math.max(...straddleRows.map((r) => r.spx_ref));
    const minSpx = Math.min(...straddleRows.map((r) => r.spx_ref));
    const maxIntradayPts = Math.max(maxSpx - openSpx, openSpx - minSpx);
    const maxIntradayPct =
      openStraddle > 0
        ? parseFloat(((maxIntradayPts / openStraddle) * 100).toFixed(1))
        : null;

    const { data: skewRows } = await supabase
      .from("skew_snapshots")
      .select("skew, created_at")
      .gte("created_at", `${today}T00:00:00`)
      .lt("created_at", `${today}T23:59:59`)
      .order("created_at", { ascending: true });

    let closingSkew = null;
    let skewDirection = null;

    if (skewRows && skewRows.length >= 2) {
      const firstSkew = skewRows[0].skew;
      closingSkew = skewRows[skewRows.length - 1].skew;
      const diff = closingSkew - firstSkew;
      skewDirection =
        Math.abs(diff) < 0.005 ? "flat" : diff > 0 ? "up" : "down";
    } else if (skewRows && skewRows.length === 1) {
      closingSkew = skewRows[0].skew;
      skewDirection = "flat";
    }

    const { error } = await withTimeout(
      supabase.from("session_summary").upsert(
        {
          date: today,
          closing_spx: closeSpx,
          closing_straddle: closing.straddle_mid,
          closing_skew: closingSkew,
          realized_move_pts: parseFloat(realizedMovePts.toFixed(2)),
          realized_move_pct_of_straddle: realizedMovePct,
          max_intraday_pts: parseFloat(maxIntradayPts.toFixed(2)),
          max_intraday_pct_of_straddle: maxIntradayPct,
          spx_closed_above_open: closeSpx > openSpx,
          skew_direction: skewDirection,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "date" },
      ),
      10000,
      "session_summary close upsert",
    );

    if (error) {
      console.error(`[${nowCT()}] session_summary close error:`, error.message);
    } else {
      console.log(
        `[${nowCT()}] 📋 Close summary | realized: ${realizedMovePts.toFixed(1)}pts (${realizedMovePct}%) | max: ${maxIntradayPts.toFixed(1)}pts | skew: ${skewDirection} | spx ${closeSpx > openSpx ? "▲" : "▼"}`,
      );
    }
  } catch (err) {
    console.error(`[${nowCT()}] writeCloseSummary error:`, err.message);
  }
}

// ─── BSM / Skew ──────────────────────────────────────────────────────────────

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

// ─── Main cycle ───────────────────────────────────────────────────────────────

async function runCycle(isOpenCycle = false) {
  if (!isMarketHours()) {
    const now = Date.now();
    if (now - lastSkipLog > 60 * 60 * 1000) {
      console.log(`[${nowCT()}] SPX fechado, tentaremos mais tarde.`);
      lastSkipLog = now;
    }
    return null;
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
      return null;
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
      console.log(`[${nowCT()}] ============================================`);
      console.log(`[${nowCT()}] 🔔 OPEN CYCLE — fetching SPX opening price`);

      const { openPrice: dxSummaryOpen, quoteMid: dxQuoteMid } =
        await getSpxOpenPrice();
      console.log(
        `[${nowCT()}]    DXFeed Summary.openPrice : ${dxSummaryOpen?.toFixed(2) ?? "N/A"}`,
      );
      console.log(
        `[${nowCT()}]    DXFeed Quote mid         : ${dxQuoteMid?.toFixed(2) ?? "N/A"}`,
      );

      const fmpBar = await getFmpOpenPrice();
      const fmpOpenPrice = fmpBar?.open ?? null;
      if (fmpBar) {
        console.log(
          `[${nowCT()}]    FMP 09:30 bar            : O:${fmpBar.open} H:${fmpBar.high} L:${fmpBar.low} C:${fmpBar.close}`,
        );
      } else {
        console.log(`[${nowCT()}]    FMP 09:30 bar            : N/A`);
      }

      spxMid = dxQuoteMid;
      const refForAtm = dxSummaryOpen ?? dxQuoteMid;
      atmStrikePrice = strikes.reduce((prev, curr) =>
        Math.abs(curr - refForAtm) < Math.abs(prev - refForAtm) ? curr : prev,
      );

      console.log(
        `[${nowCT()}]    ATM strike (DXFeed)      : ${atmStrikePrice}`,
      );

      if (fmpOpenPrice !== null && dxSummaryOpen !== null) {
        const diff = Math.abs(fmpOpenPrice - dxSummaryOpen).toFixed(2);
        const fmpAtm = strikes.reduce((prev, curr) =>
          Math.abs(curr - fmpOpenPrice) < Math.abs(prev - fmpOpenPrice)
            ? curr
            : prev,
        );
        console.log(
          `[${nowCT()}]    FMP open price           : ${fmpOpenPrice.toFixed(2)}`,
        );
        console.log(`[${nowCT()}]    DXFeed vs FMP diff       : ${diff} pts`);
        console.log(
          `[${nowCT()}]    ATM strike (FMP)         : ${fmpAtm}${fmpAtm !== atmStrikePrice ? " ⚠️  DIFFERENT" : " ✓ same"}`,
        );
      }

      const esMid = await getEsMid(ES_SYMBOL);
      if (esMid !== null && spxMid > 0) {
        esBasis = parseFloat((esMid - spxMid).toFixed(2));
        console.log(
          `[${nowCT()}]    ES mid: ${esMid.toFixed(2)} | SPX mid: ${spxMid.toFixed(2)} | Basis: ${esBasis}`,
        );
      }
      console.log(`[${nowCT()}] ============================================`);
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
      return null;
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
    if (session) {
      const smlStrike = session.sml_ref;
      const sessionWidths = session.widths ?? [];
      const optType = session.type === "put" ? "P" : "C";

      if (smlStrike && sessionWidths.length > 0) {
        const flyStrikeSet = new Set();
        for (const width of sessionWidths) {
          flyStrikeSet.add(smlStrike - width);
          flyStrikeSet.add(smlStrike);
          flyStrikeSet.add(smlStrike + width);
        }

        const flySymbols = [...flyStrikeSet]
          .map((s) => getStreamerSymbol(s, optType))
          .filter(Boolean);

        if (flySymbols.length > 0) {
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
                `[${nowCT()}] Quotes para ${width}W fly não encontradas.`,
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
        }
      }
    }

    // Return open cycle data for session summary + weekly straddle
    if (isOpenCycle) {
      return {
        spxMid,
        atmStrike: atmStrikePrice,
        straddleMid,
        esBasis,
        options,
      };
    }
    return null;
  } catch (err) {
    console.error(`[${nowCT()}] Cycle error:`, err.message);
    return null;
  }
}

// ─── Scheduler ───────────────────────────────────────────────────────────────

export async function runAndScheduleNext() {
  if (shouldFireOpenCycle()) {
    openCycleFiredDate = getTodayET();
    skewCycleCount = 0;
    console.log(`[${nowCT()}] 🔔 Disparando ciclo de abertura...`);
    const openData = await runCycle(true);

    if (openData) {
      writeOpenSummary({
        today: getTodayET(),
        spxMid: openData.spxMid,
        atmStrike: openData.atmStrike,
        straddleMid: openData.straddleMid,
        esBasis: openData.esBasis,
      }).catch((err) =>
        console.error(`[${nowCT()}] writeOpenSummary failed:`, err.message),
      );

      // Weekly straddle — Monday only
      if (shouldFireWeeklyOpenCycle()) {
        weeklyOpenCycleFiredDate = getTodayET();
        captureWeeklyStraddle(openData.options, openData.spxMid).catch((err) =>
          console.error(
            `[${nowCT()}] captureWeeklyStraddle failed:`,
            err.message,
          ),
        );
      }
    }
  } else if (shouldFireCloseCycle()) {
    closeCycleFiredDate = getTodayET();
    console.log(`[${nowCT()}] 🔔 Disparando ciclo de fechamento...`);
    await runCycle(false);
    writeCloseSummary(getTodayET()).catch((err) =>
      console.error(`[${nowCT()}] writeCloseSummary failed:`, err.message),
    );
  } else {
    await runCycle(false);
  }

  setTimeout(runAndScheduleNext, msUntilNextMinute());
}
