import { client, supabase } from "./clients.mjs";
import { nowCT } from "./market-hours.mjs";
import { getFrontMonthEsSymbol } from "./futures.mjs";

const CHANNEL_NAME = "live-ticks";
const BROADCAST_INTERVAL_MS = 200;
const SNAPSHOT_INTERVAL_MS = 2000;
const REFRESH_INTERVAL_MS = 5 * 60 * 1000;
const STATS_INTERVAL_MS = 30 * 1000;

// Indices use Trade event for `last`; quote-based instruments use Quote bid/ask.
const CORE_QUOTE_SYMBOLS = ["SPX"];
const CORE_TRADE_SYMBOLS = ["VIX", "VIX1D", "VIX3M"];

const tickState = new Map();
const dirtySymbols = new Set();
const subscribedSymbols = new Set();

let windowTickBroadcasts = 0;
let windowSnapshots = 0;
const windowDirtySymbols = new Set();

let channel = null;
let dxListener = null;
let broadcastTimer = null;
let snapshotTimer = null;
let refreshTimer = null;
let statsTimer = null;
let started = false;

function emptyTick() {
  return {
    bid: 0,
    ask: 0,
    mid: 0,
    prevClose: null,
    last: null,
    delta: null,
    gamma: null,
    theta: null,
    vega: null,
    iv: null,
    lastUpdateMs: 0,
  };
}

function applyEvent(e) {
  const sym = e?.eventSymbol;
  if (!sym || !subscribedSymbols.has(sym)) return;

  const cur = tickState.get(sym) ?? emptyTick();
  const now = Date.now();
  let changed = false;

  if (e.eventType === "Quote") {
    if (e.bidPrice > 0 && e.askPrice > 0) {
      cur.bid = e.bidPrice;
      cur.ask = e.askPrice;
      cur.mid = (e.bidPrice + e.askPrice) / 2;
      cur.lastUpdateMs = now;
      changed = true;
    }
  } else if (e.eventType === "Trade") {
    if (e.price > 0) {
      cur.last = e.price;
      cur.lastUpdateMs = now;
      changed = true;
    }
  } else if (e.eventType === "Summary") {
    if (e.prevDayClosePrice > 0) {
      cur.prevClose = e.prevDayClosePrice;
      cur.lastUpdateMs = now;
      changed = true;
    }
  } else if (e.eventType === "Greeks") {
    cur.delta = e.delta ?? cur.delta;
    cur.gamma = e.gamma ?? cur.gamma;
    cur.theta = e.theta ?? cur.theta;
    cur.vega = e.vega ?? cur.vega;
    cur.iv = e.volatility ?? cur.iv;
    cur.lastUpdateMs = now;
    changed = true;
  }

  if (changed) {
    tickState.set(sym, cur);
    dirtySymbols.add(sym);
  }
}

async function flushBatch() {
  if (dirtySymbols.size === 0 || !channel) return;
  const payload = {};
  for (const sym of dirtySymbols) {
    const t = tickState.get(sym);
    if (t) {
      payload[sym] = t;
      windowDirtySymbols.add(sym);
    }
  }
  dirtySymbols.clear();
  try {
    await channel.send({ type: "broadcast", event: "tick", payload });
    windowTickBroadcasts++;
  } catch (err) {
    console.error(`[${nowCT()}] [tickPub] tick broadcast error: ${err.message}`);
  }
}

async function flushSnapshot() {
  if (!channel || tickState.size === 0) return;
  const payload = Object.fromEntries(tickState);
  try {
    await channel.send({ type: "broadcast", event: "snapshot", payload });
    windowSnapshots++;
  } catch (err) {
    console.error(
      `[${nowCT()}] [tickPub] snapshot broadcast error: ${err.message}`,
    );
  }
}

function logStats() {
  console.log(
    `[${nowCT()}] [tickPub] ${windowTickBroadcasts} tick broadcasts / 30s · ${windowSnapshots} snapshots / 30s · ${windowDirtySymbols.size} unique dirty symbols`,
  );
  windowTickBroadcasts = 0;
  windowSnapshots = 0;
  windowDirtySymbols.clear();
}

async function fetchWatchlistSymbols() {
  try {
    const watchlists = await client.watchlistsService.getAllWatchlists();
    const raw =
      watchlists?.find?.((w) => w?.name === "vovonacci")?.[
        "watchlist-entries"
      ] ?? [];
    const now = new Date();
    const symbols = [];
    for (const e of raw) {
      if (e["instrument-type"] === "Future") {
        try {
          const futures = await client.instrumentsService.getFutures({
            symbols: [e.symbol],
          });
          const active = futures
            ?.filter(
              (f) =>
                f.active === true &&
                new Date(f["expiration-date"]) > now &&
                f["future-product"]?.["root-symbol"] === e.symbol,
            )
            ?.sort(
              (a, b) =>
                new Date(a["expiration-date"]).getTime() -
                new Date(b["expiration-date"]).getTime(),
            )?.[0];
          if (active?.["streamer-symbol"])
            symbols.push(active["streamer-symbol"]);
        } catch (err) {
          console.warn(
            `[${nowCT()}] [tickPub] watchlist future ${e.symbol} skipped: ${err.message}`,
          );
        }
      } else if (e.symbol) {
        symbols.push(e.symbol);
      }
    }
    return symbols;
  } catch (err) {
    console.warn(`[${nowCT()}] [tickPub] watchlist fetch failed: ${err.message}`);
    return [];
  }
}

async function fetchPositionSymbols() {
  const accountNumber = process.env.TASTY_ACCOUNT_NUMBER;
  if (!accountNumber) {
    return [];
  }
  try {
    const raw =
      await client.balancesAndPositionsService.getPositionsList(accountNumber);
    const positions = Array.isArray(raw) ? raw : (raw?.items ?? []);
    const symbols = [];
    for (const pos of positions) {
      const t = pos["instrument-type"];
      if (t !== "Equity Option" && t !== "Future Option") continue;
      const ss = pos["streamer-symbol"];
      if (ss) symbols.push(ss);
    }
    return symbols;
  } catch (err) {
    console.warn(
      `[${nowCT()}] [tickPub] positions fetch failed: ${err.message}`,
    );
    return [];
  }
}

async function buildSubscriptionSet() {
  const set = new Set();
  for (const s of CORE_QUOTE_SYMBOLS) set.add(s);
  for (const s of CORE_TRADE_SYMBOLS) set.add(s);
  try {
    const es = await getFrontMonthEsSymbol();
    if (es) set.add(es);
  } catch (err) {
    console.warn(
      `[${nowCT()}] [tickPub] ES front-month resolve failed: ${err.message}`,
    );
  }
  for (const s of await fetchWatchlistSymbols()) set.add(s);
  for (const s of await fetchPositionSymbols()) set.add(s);
  return set;
}

async function refreshSubscriptions() {
  const desired = await buildSubscriptionSet();
  const toAdd = [];
  const toRemove = [];
  for (const s of desired) if (!subscribedSymbols.has(s)) toAdd.push(s);
  for (const s of subscribedSymbols) if (!desired.has(s)) toRemove.push(s);

  if (toRemove.length > 0) {
    try {
      client.quoteStreamer.unsubscribe(toRemove);
    } catch (err) {
      console.error(`[${nowCT()}] [tickPub] unsubscribe error: ${err.message}`);
    }
    for (const s of toRemove) {
      subscribedSymbols.delete(s);
      tickState.delete(s);
    }
    console.log(
      `[${nowCT()}] [tickPub] unsubscribed ${toRemove.length}: ${toRemove.slice(0, 5).join(",")}${toRemove.length > 5 ? "..." : ""}`,
    );
  }

  if (toAdd.length > 0) {
    try {
      client.quoteStreamer.subscribe(toAdd);
      for (const s of toAdd) subscribedSymbols.add(s);
      console.log(
        `[${nowCT()}] [tickPub] subscribed ${toAdd.length}: ${toAdd.slice(0, 5).join(",")}${toAdd.length > 5 ? "..." : ""}`,
      );
    } catch (err) {
      console.error(`[${nowCT()}] [tickPub] subscribe error: ${err.message}`);
    }
  }
}

export async function startTickPublisher() {
  if (started) return;
  started = true;

  channel = supabase.channel(CHANNEL_NAME);
  await new Promise((resolve, reject) => {
    let settled = false;
    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true;
        reject(new Error("Supabase channel subscribe timed out after 10s"));
      }
    }, 10_000);
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED" && !settled) {
        settled = true;
        clearTimeout(timeout);
        resolve();
      }
    });
  });
  console.log(
    `[${nowCT()}] [tickPub] channel "${CHANNEL_NAME}" subscribed`,
  );

  dxListener = (events) => {
    if (!events || events.length === 0) return;
    for (const e of events) applyEvent(e);
  };
  client.quoteStreamer.addEventListener(dxListener);

  await refreshSubscriptions();
  broadcastTimer = setInterval(flushBatch, BROADCAST_INTERVAL_MS);
  snapshotTimer = setInterval(flushSnapshot, SNAPSHOT_INTERVAL_MS);
  refreshTimer = setInterval(refreshSubscriptions, REFRESH_INTERVAL_MS);
  statsTimer = setInterval(logStats, STATS_INTERVAL_MS);

  console.log(
    `[${nowCT()}] [tickPub] started with ${subscribedSymbols.size} symbols`,
  );
}

export async function stopTickPublisher() {
  if (!started) return;
  started = false;

  if (broadcastTimer) {
    clearInterval(broadcastTimer);
    broadcastTimer = null;
  }
  if (snapshotTimer) {
    clearInterval(snapshotTimer);
    snapshotTimer = null;
  }
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }
  if (statsTimer) {
    clearInterval(statsTimer);
    statsTimer = null;
  }
  if (dxListener) {
    try {
      client.quoteStreamer.removeEventListener(dxListener);
    } catch {}
    dxListener = null;
  }
  if (subscribedSymbols.size > 0) {
    try {
      client.quoteStreamer.unsubscribe([...subscribedSymbols]);
    } catch {}
  }
  if (channel) {
    try {
      await supabase.removeChannel(channel);
    } catch {}
    channel = null;
  }
  subscribedSymbols.clear();
  tickState.clear();
  dirtySymbols.clear();
  console.log(`[${nowCT()}] [tickPub] stopped`);
}

export function getTick(symbol) {
  return tickState.get(symbol) ?? null;
}

// Called by the poller's watchdog after a successful DXFeed reconnect.
// A fresh dxLink session has none of our prior subscriptions, and the SDK
// may or may not preserve event listeners across disconnect/connect — so we
// re-attach defensively and re-issue subscribe() for the full set.
export function onDxFeedReconnected() {
  if (!started || !dxListener) return;
  try {
    client.quoteStreamer.removeEventListener(dxListener);
  } catch {}
  client.quoteStreamer.addEventListener(dxListener);
  if (subscribedSymbols.size > 0) {
    try {
      client.quoteStreamer.subscribe([...subscribedSymbols]);
      console.log(
        `[${nowCT()}] [tickPub] re-subscribed ${subscribedSymbols.size} symbols after reconnect`,
      );
    } catch (err) {
      console.error(
        `[${nowCT()}] [tickPub] re-subscribe error after reconnect: ${err.message}`,
      );
    }
  }
}
