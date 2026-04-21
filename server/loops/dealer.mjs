import { supabase } from "../lib/clients.mjs";
import {
  nowCT,
  getTodayET,
  getETDay,
  getETTime,
  isMarketHours,
  msUntilNextMinute,
} from "../lib/market-hours.mjs";
import { withTimeout } from "../lib/dxfeed.mjs";

const BASE_URL = "https://www.quantedoptions.com/api/v1";
const LOCAL_BAND_PT = 15; // ±15pt around spot for local GEX
const NEAR_RANGE_PT = 50; // ±50pt around spot for top walls

// ─── API ──────────────────────────────────────────────────────────────────────

async function fetchStrikes(metric) {
  const key = process.env.QUANTED_API_KEY;
  if (!key) throw new Error("QUANTED_API_KEY not set");

  const url = `${BASE_URL}/strikes?product=SPX&metric=${metric}&expiry=0dte&customer_type=mm&key=${key}`;
  const res = await withTimeout(
    fetch(url),
    15000,
    `quanted /strikes ${metric}`,
  );

  if (res.status === 429) {
    const wait = parseInt(res.headers.get("Retry-After") ?? "2", 10);
    console.log(`[${nowCT()}] Quanted 429 — waiting ${wait}s before retry`);
    await new Promise((r) => setTimeout(r, wait * 1000));
    return fetchStrikes(metric); // one retry
  }

  if (res.status === 402) {
    console.error(`[${nowCT()}] Quanted 402 — credits exhausted`);
    return null;
  }

  if (!res.ok) {
    console.error(`[${nowCT()}] Quanted /strikes ${metric} → ${res.status}`);
    return null;
  }

  return res.json();
}

async function fetchTimeline() {
  const key = process.env.QUANTED_API_KEY;
  if (!key) throw new Error("QUANTED_API_KEY not set");

  const url = `${BASE_URL}/timeline?product=SPX&key=${key}`;
  const res = await withTimeout(fetch(url), 15000, "quanted /timeline");

  if (!res.ok) {
    console.error(`[${nowCT()}] Quanted /timeline → ${res.status}`);
    return null;
  }

  return res.json();
}

// ─── Derivations ──────────────────────────────────────────────────────────────

function computeScalars(strikesData, spot) {
  // Each row: [strike, net, call_metric, put_metric, call_mid, put_mid]
  let localTotal = 0;
  let topPosStrike = null;
  let topPosValue = null;
  let topNegStrike = null;
  let topNegValue = null;

  for (const row of strikesData) {
    const strike = row[0];
    const net = row[1];

    if (Math.abs(strike - spot) <= LOCAL_BAND_PT) {
      localTotal += net;
    }

    if (Math.abs(strike - spot) <= NEAR_RANGE_PT) {
      if (net > 0 && (topPosValue === null || net > topPosValue)) {
        topPosStrike = strike;
        topPosValue = net;
      }
      if (net < 0 && (topNegValue === null || net < topNegValue)) {
        topNegStrike = strike;
        topNegValue = net;
      }
    }
  }

  return { localTotal, topPosStrike, topPosValue, topNegStrike, topNegValue };
}

// ─── Spot reference ───────────────────────────────────────────────────────────
// Pull from straddle_snapshots — avoids an extra DXFeed call

async function getLatestSpot() {
  try {
    const today = getTodayET();
    const { data } = await supabase
      .from("straddle_snapshots")
      .select("spx_ref")
      .gte("created_at", `${today}T00:00:00`)
      .lt("created_at", `${today}T23:59:59`)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return data?.spx_ref ?? null;
  } catch {
    return null;
  }
}

// ─── Capture ──────────────────────────────────────────────────────────────────

async function captureStrikes(metric, spot) {
  try {
    const body = await fetchStrikes(metric);
    if (!body || !Array.isArray(body.data)) return;

    const today = getTodayET();
    const barTime = getETTime().slice(0, 5); // "HH:MM"
    const { localTotal, topPosStrike, topPosValue, topNegStrike, topNegValue } =
      computeScalars(body.data, spot);

    const { error } = await withTimeout(
      supabase.from("dealer_strike_snapshots").insert({
        date: today,
        bar_time: barTime,
        metric,
        total: body.total,
        strikes: body.data,
        spot_ref: spot,
        local_total: localTotal,
        top_pos_strike: topPosStrike,
        top_pos_value: topPosValue,
        top_neg_strike: topNegStrike,
        top_neg_value: topNegValue,
      }),
      10000,
      `dealer_strike_snapshots insert ${metric}`,
    );

    if (error) {
      console.error(
        `[${nowCT()}] Dealer ${metric} insert error:`,
        error.message,
      );
      return;
    }

    const totalStr = fmtGexLog(body.total);
    const localStr = fmtGexLog(localTotal);
    console.log(
      `[${nowCT()}] 📊 Dealer ${metric.toUpperCase()} | total: ${totalStr} | local(±${LOCAL_BAND_PT}pt): ${localStr} | +wall: ${topPosStrike ?? "—"} | -wall: ${topNegStrike ?? "—"}`,
    );
  } catch (err) {
    console.error(`[${nowCT()}] captureStrikes ${metric} error:`, err.message);
  }
}

function fmtGexLog(v) {
  if (v === null) return "—";
  const abs = Math.abs(v);
  const sign = v >= 0 ? "+" : "-";
  if (abs >= 1e9) return `${sign}${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${sign}${(abs / 1e6).toFixed(0)}M`;
  return `${sign}${abs.toFixed(0)}`;
}

// ─── EOD timeline ─────────────────────────────────────────────────────────────

let timelineFiredDate = null;

async function captureTimeline() {
  const today = getTodayET();
  if (timelineFiredDate === today) return;

  try {
    const body = await fetchTimeline();
    if (!body || !Array.isArray(body.data) || body.data.length === 0) return;

    // Derive scalars from RTH window only
    const rthBars = body.data.filter((b) => b.ts >= "09:30" && b.ts <= "16:15");
    if (rthBars.length === 0) return;

    const openGex = rthBars[0]?.gex ?? null;
    const closeGex = rthBars[rthBars.length - 1]?.gex ?? null;
    const gexValues = rthBars.map((b) => b.gex);
    const minGex = Math.min(...gexValues);
    const maxGex = Math.max(...gexValues);
    const regimeOpen = openGex === null ? null : openGex >= 0 ? "pos" : "neg";

    const { error } = await withTimeout(
      supabase.from("dealer_timeline_snapshots").upsert(
        {
          date: today,
          data: body.data,
          open_gex: openGex,
          close_gex: closeGex,
          min_gex: minGex,
          max_gex: maxGex,
          regime_open: regimeOpen,
        },
        { onConflict: "date" },
      ),
      10000,
      "dealer_timeline_snapshots upsert",
    );

    if (error) {
      console.error(
        `[${nowCT()}] Dealer timeline upsert error:`,
        error.message,
      );
      return;
    }

    timelineFiredDate = today;
    console.log(
      `[${nowCT()}] 📊 Dealer TIMELINE | open: ${fmtGexLog(openGex)} | close: ${fmtGexLog(closeGex)} | min: ${fmtGexLog(minGex)} | regime: ${regimeOpen}`,
    );
  } catch (err) {
    console.error(`[${nowCT()}] captureTimeline error:`, err.message);
  }
}

// ─── Scheduler ────────────────────────────────────────────────────────────────

let lastCaptureFiredMinute = null;

function shouldCapture() {
  const day = getETDay();
  if (["Sat", "Sun"].includes(day)) return false;
  if (!isMarketHours()) return false;

  const time = getETTime();
  const currentMinute = time.slice(0, 5); // "HH:MM"
  if (lastCaptureFiredMinute === currentMinute) return false;

  // Fire on every 5-minute boundary: :00, :05, :10 ... :55
  const minute = parseInt(currentMinute.slice(3, 5), 10);
  return minute % 5 === 0;
}

function shouldCaptureTimeline() {
  const day = getETDay();
  if (["Sat", "Sun"].includes(day)) return false;
  const time = getETTime();
  return time >= "16:00:00" && time <= "16:05:00";
}

export async function runDealerLoop() {
  try {
    // EOD timeline — fire-and-forget
    if (shouldCaptureTimeline()) {
      captureTimeline().catch((err) =>
        console.error(`[${nowCT()}] captureTimeline failed:`, err.message),
      );
    }

    if (shouldCapture()) {
      const currentMinute = getETTime().slice(0, 5);
      lastCaptureFiredMinute = currentMinute;

      const spot = await getLatestSpot();
      if (!spot) {
        console.log(`[${nowCT()}] Dealer: no spot ref yet, skipping.`);
      } else {
        // Sequential with a small gap — stays well within 2 req/s limit
        await captureStrikes("gex", spot);
        await new Promise((r) => setTimeout(r, 600));
        await captureStrikes("cex", spot);
      }
    }
  } catch (err) {
    console.error(`[${nowCT()}] Dealer loop error:`, err.message);
  }

  setTimeout(runDealerLoop, msUntilNextMinute());
}
