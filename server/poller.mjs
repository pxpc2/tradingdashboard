import { client } from "./lib/clients.mjs";
import { nowCT } from "./lib/market-hours.mjs";
import { runAndScheduleNext } from "./loops/main.mjs";
import { runOhlcLoop } from "./loops/ohlc.mjs";

console.log(`[${nowCT()}] Inicializando servidor...`);
await client.quoteStreamer.connect();
console.log(`[${nowCT()}] DXLink conectado com sucesso.`);

runAndScheduleNext();
runOhlcLoop();

process.on("SIGINT", async () => {
  console.log(`\n[${nowCT()}] Desligando..`);
  await client.quoteStreamer.disconnect();
  process.exit(0);
});
