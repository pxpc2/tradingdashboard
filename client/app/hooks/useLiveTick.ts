"use client";

import { useState, useEffect, useRef } from "react";

export type TickData = {
  bid: number;
  ask: number;
  mid: number;
  prevClose: number | null;
  last: number | null;
  // Greeks — only populated for option symbols
  delta: number | null;
  gamma: number | null;
  theta: number | null;
  vega: number | null;
  iv: number | null;
};

export const ES_STREAMER_SYMBOL = "/ESM26:XCME";

export function useLiveTick(symbols: string[]) {
  const [ticks, setTicks] = useState<Record<string, TickData>>({});
  const wsRef = useRef<WebSocket | null>(null);
  const channelId = useRef(1);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const cancelledRef = useRef(false);

  useEffect(() => {
    if (symbols.length === 0) return;
    cancelledRef.current = false;

    async function connect() {
      if (cancelledRef.current) return;

      try {
        const res = await fetch("/api/dxfeed-token");
        const { url, token } = await res.json();
        if (cancelledRef.current) return;

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
          ws.send(JSON.stringify({ type: "AUTH", channel: 0, token }));
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
                add: [
                  ...symbols.map((symbol) => ({ type: "Quote", symbol })),
                  ...symbols.map((symbol) => ({ type: "Summary", symbol })),
                  ...symbols.map((symbol) => ({ type: "Trade", symbol })),
                  ...symbols.map((symbol) => ({ type: "Greeks", symbol })),
                ],
              }),
            );
          }

          if (msg.type === "FEED_DATA" && msg.channel === channelId.current) {
            const events = msg.data;
            if (!Array.isArray(events)) return;

            setTicks((prev) => {
              const next = { ...prev };
              for (const event of events) {
                if (!symbols.includes(event.eventSymbol)) continue;
                const existing = next[event.eventSymbol] ?? {
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
                };

                if (event.eventType === "Quote") {
                  if (event.bidPrice > 0 && event.askPrice > 0) {
                    next[event.eventSymbol] = {
                      ...existing,
                      bid: event.bidPrice,
                      ask: event.askPrice,
                      mid: (event.bidPrice + event.askPrice) / 2,
                    };
                  }
                }

                if (event.eventType === "Trade") {
                  if (event.price > 0) {
                    next[event.eventSymbol] = {
                      ...existing,
                      last: event.price,
                    };
                  }
                }

                if (event.eventType === "Summary") {
                  if (event.prevDayClosePrice > 0) {
                    next[event.eventSymbol] = {
                      ...existing,
                      prevClose: event.prevDayClosePrice,
                    };
                  }
                }

                if (event.eventType === "Greeks") {
                  next[event.eventSymbol] = {
                    ...existing,
                    delta: event.delta ?? null,
                    gamma: event.gamma ?? null,
                    theta: event.theta ?? null,
                    vega: event.vega ?? null,
                    iv: event.volatility ?? null,
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

        ws.onerror = () => {
          ws.close();
        };

        ws.onclose = () => {
          wsRef.current = null;
          if (!cancelledRef.current) {
            console.log(
              "[useLiveTick] Connection closed, reconnecting in 5s...",
            );
            reconnectTimeoutRef.current = setTimeout(connect, 5 * 1000);
          }
        };
      } catch (err) {
        console.error("[useLiveTick] Failed to connect:", err);
        if (!cancelledRef.current) {
          reconnectTimeoutRef.current = setTimeout(connect, 5 * 1000);
        }
      }
    }

    connect();

    return () => {
      cancelledRef.current = true;
      if (reconnectTimeoutRef.current)
        clearTimeout(reconnectTimeoutRef.current);
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [symbols.join(",")]);

  return ticks;
}
