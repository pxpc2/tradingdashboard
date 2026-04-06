"use client";

import { useState, useEffect, useRef } from "react";

type TickData = {
  bid: number;
  ask: number;
  mid: number;
};

// Front-month ES futures streamer symbol — update quarterly
// Format: /ES{month}{2-digit-year}:XCME
// H=Mar, M=Jun, U=Sep, Z=Dec — current: Jun 2026
export const ES_STREAMER_SYMBOL = "/ESM26:XCME";

function isSpxOpen(): boolean {
  const day = new Date().toLocaleDateString("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
  });
  const time = new Date().toLocaleTimeString("en-US", {
    timeZone: "America/New_York",
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  if (["Sat", "Sun"].includes(day)) return false;
  return time >= "09:30:00" && time < "16:00:00";
}

function isEsOpen(): boolean {
  const day = new Date().toLocaleDateString("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
  });
  const time = new Date().toLocaleTimeString("en-US", {
    timeZone: "America/New_York",
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  if (day === "Sat") return false;
  if (day === "Sun" && time < "18:00:00") return false;
  if (!["Sat", "Sun"].includes(day) && time >= "17:00:00" && time < "18:00:00")
    return false;
  return true;
}

export function useLiveTick(symbols: string[]) {
  const [ticks, setTicks] = useState<Record<string, TickData>>({});
  const wsRef = useRef<WebSocket | null>(null);
  const channelId = useRef(1);

  useEffect(() => {
    if (symbols.length === 0) return;

    const activeSymbols = symbols.filter((s) => {
      if (s === "SPX") return isSpxOpen();
      if (s.startsWith("/ES")) return isEsOpen();
      return true;
    });

    if (activeSymbols.length === 0) return;

    let cancelled = false;

    async function connect() {
      try {
        const res = await fetch("/api/dxfeed-token");
        const { url, token } = await res.json();
        if (cancelled) return;

        const ws = new WebSocket(url);
        wsRef.current = ws;

        ws.onopen = () => {
          ws.send(
            JSON.stringify({
              type: "SETUP",
              channel: 0,
              version: "0.1",
              minVersion: "0.1",
              keepaliveTimeout: 60,
              acceptKeepaliveTimeout: 60,
            }),
          );
          ws.send(
            JSON.stringify({
              type: "AUTH",
              channel: 0,
              token,
            }),
          );
          ws.send(
            JSON.stringify({
              type: "CHANNEL_REQUEST",
              channel: channelId.current,
              service: "FEED",
              parameters: { contract: "AUTO" },
            }),
          );
        };

        ws.onmessage = (event) => {
          const msg = JSON.parse(event.data);

          if (
            msg.type === "CHANNEL_OPENED" &&
            msg.channel === channelId.current
          ) {
            ws.send(
              JSON.stringify({
                type: "FEED_SUBSCRIPTION",
                channel: channelId.current,
                add: activeSymbols.map((symbol) => ({ type: "Quote", symbol })),
              }),
            );
          }

          if (msg.type === "FEED_DATA" && msg.channel === channelId.current) {
            const events = msg.data;
            if (!Array.isArray(events)) return;
            setTicks((prev) => {
              const next = { ...prev };
              for (const event of events) {
                if (
                  event.eventType === "Quote" &&
                  activeSymbols.includes(event.eventSymbol) &&
                  event.bidPrice > 0 &&
                  event.askPrice > 0
                ) {
                  next[event.eventSymbol] = {
                    bid: event.bidPrice,
                    ask: event.askPrice,
                    mid: (event.bidPrice + event.askPrice) / 2,
                  };
                }
              }
              return next;
            });
          }

          if (msg.type === "KEEPALIVE") {
            ws.send(JSON.stringify({ type: "KEEPALIVE", channel: 0 }));
          }
        };

        ws.onerror = (e) => {
          console.error("[useLiveTick] WebSocket error", e);
        };

        ws.onclose = () => {
          wsRef.current = null;
        };
      } catch (err) {
        console.error("[useLiveTick] Failed to connect", err);
      }
    }

    connect();

    return () => {
      cancelled = true;
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [symbols.join(",")]);

  return ticks;
}
