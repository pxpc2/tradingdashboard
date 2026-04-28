import { client } from "./lib/clients.mjs";
import { nowCT } from "./lib/market-hours.mjs";
import { runAndScheduleNext } from "./loops/main.mjs";
import { runOhlcLoop } from "./loops/ohlc.mjs";
import {
  startTickPublisher,
  stopTickPublisher,
} from "./lib/tickPublisher.mjs";

console.log(`[${nowCT()}] Inicializando servidor...`);
await client.quoteStreamer.connect();
console.log(`[${nowCT()}] DXLink conectado com sucesso.`);

// ─── DXFeed Reconnect Watchdog ────────────────────────────────────────────────
// Track last event time — updated by any DXFeed event
export let lastDxFeedEventAt = Date.now();

export function touchDxFeedHeartbeat() {
  lastDxFeedEventAt = Date.now();
}

// Register a global listener — tracks heartbeat + per-30s event flow stats
let windowEventCount = 0;
const windowEventTypes = new Set();
const windowSymbols = new Set();
let lastEventType = null;
let lastEventSymbol = null;

const heartbeatListener = (events) => {
  if (!events || events.length === 0) return;
  touchDxFeedHeartbeat();
  windowEventCount += events.length;
  for (const e of events) {
    if (e.eventType) windowEventTypes.add(e.eventType);
    if (e.eventSymbol) windowSymbols.add(e.eventSymbol);
    lastEventType = e.eventType ?? lastEventType;
    lastEventSymbol = e.eventSymbol ?? lastEventSymbol;
  }
};
client.quoteStreamer.addEventListener(heartbeatListener);

let isReconnecting = false;

async function reconnectDxFeed() {
  if (isReconnecting) return;
  isReconnecting = true;
  console.log(`[${nowCT()}] 🔄 DXFeed silent >2min — reconnecting...`);
  try {
    client.quoteStreamer.removeEventListener(heartbeatListener);
    await client.quoteStreamer.disconnect();
  } catch (err) {
    console.log(
      `[${nowCT()}] DXFeed disconnect error (ignored): ${err.message}`,
    );
  }
  try {
    await client.quoteStreamer.connect();
    client.quoteStreamer.addEventListener(heartbeatListener);
    lastDxFeedEventAt = Date.now();
    console.log(`[${nowCT()}] ✅ DXFeed reconnected.`);
  } catch (err) {
    console.error(`[${nowCT()}] DXFeed reconnect failed: ${err.message}`);
  }
  isReconnecting = false;
}

// Per-30s event-flow summary + reconnect if silent >2min
setInterval(async () => {
  const silentMs = Date.now() - lastDxFeedEventAt;
  const silentSec = Math.round(silentMs / 1000);
  const types = [...windowEventTypes].join(",") || "—";
  const symPreview = [...windowSymbols].slice(0, 6).join(",") || "—";
  console.log(
    `[${nowCT()}] [dxfeed] ${windowEventCount} events / 30s · types=${types} · symbols=${symPreview} · last=${lastEventType ?? "—"}/${lastEventSymbol ?? "—"} · silent=${silentSec}s`,
  );
  windowEventCount = 0;
  windowEventTypes.clear();
  windowSymbols.clear();

  if (silentMs > 2 * 60 * 1000) {
    await reconnectDxFeed();
  }
}, 30 * 1000);

// ─── Start tick publisher (browser ticks via Supabase Broadcast) ─────────────
await startTickPublisher();

// ─── Start loops ──────────────────────────────────────────────────────────────
runAndScheduleNext();
runOhlcLoop();

process.on("SIGINT", async () => {
  console.log(`\n[${nowCT()}] Desligando..`);
  await stopTickPublisher();
  await client.quoteStreamer.disconnect();
  process.exit(0);
});
