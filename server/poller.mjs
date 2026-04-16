import { client } from "./lib/clients.mjs";
import { nowCT } from "./lib/market-hours.mjs";
import { runAndScheduleNext } from "./loops/main.mjs";
import { runOhlcLoop } from "./loops/ohlc.mjs";

console.log(`[${nowCT()}] Inicializando servidor...`);
await client.quoteStreamer.connect();
console.log(`[${nowCT()}] DXLink conectado com sucesso.`);

// ─── DXFeed Reconnect Watchdog ────────────────────────────────────────────────
// Track last event time — updated by any DXFeed event
export let lastDxFeedEventAt = Date.now();

export function touchDxFeedHeartbeat() {
  lastDxFeedEventAt = Date.now();
}

// Register a global listener to track heartbeat
const heartbeatListener = () => touchDxFeedHeartbeat();
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

// Check every 30s — reconnect if no events for 2 minutes
setInterval(async () => {
  const silentMs = Date.now() - lastDxFeedEventAt;
  if (silentMs > 2 * 60 * 1000) {
    await reconnectDxFeed();
  }
}, 30 * 1000);

// ─── Start loops ──────────────────────────────────────────────────────────────
runAndScheduleNext();
runOhlcLoop();

process.on("SIGINT", async () => {
  console.log(`\n[${nowCT()}] Desligando..`);
  await client.quoteStreamer.disconnect();
  process.exit(0);
});
