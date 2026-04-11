"use client";

import { useState, useEffect } from "react";

type City = {
  id: string;
  abbr: string;
  timezone: string;
};

const CITIES: City[] = [
  { id: "chi", abbr: "CHI", timezone: "America/Chicago" },
  { id: "nyc", abbr: "NY", timezone: "America/New_York" },
  { id: "bsb", abbr: "BSB", timezone: "America/Sao_Paulo" },
  { id: "ldn", abbr: "LDN", timezone: "Europe/London" },
];

function getTime(timezone: string): string {
  return new Date().toLocaleTimeString("en-US", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function getUTCOffset(timezone: string): number {
  const now = new Date();
  const str = now.toLocaleString("en-US", {
    timeZone: timezone,
    timeZoneName: "shortOffset",
  });
  const match = str.match(/GMT([+-]\d+(?::\d+)?)/);
  if (!match) return 0;
  const parts = match[1].split(":");
  const sign = Math.sign(parseInt(parts[0]));
  return parseInt(parts[0]) + (parts[1] ? (parseInt(parts[1]) / 60) * sign : 0);
}

function getETOffset(timezone: string): string {
  const diff = getUTCOffset(timezone) - getUTCOffset("America/New_York");
  if (diff === 0) return "ET+0";
  return diff > 0 ? `ET+${diff}` : `ET${diff}`;
}

export default function WorldClock() {
  const [times, setTimes] = useState<Record<string, string>>({});
  const [hovered, setHovered] = useState<string | null>(null);

  useEffect(() => {
    function update() {
      const newTimes: Record<string, string> = {};
      for (const city of CITIES) {
        newTimes[city.id] = getTime(city.timezone);
      }
      setTimes(newTimes);
    }
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex gap-1.5">
      {CITIES.map((city) => {
        const isHovered = hovered === city.id;
        return (
          <div
            key={city.id}
            className="flex-1 bg-[#111] rounded px-3 py-2 flex justify-between items-center transition-all cursor-default"
            style={{
              border: isHovered
                ? "1px solid rgba(245, 158, 11, 0.3)"
                : "1px solid transparent",
            }}
            onMouseEnter={() => setHovered(city.id)}
            onMouseLeave={() => setHovered(null)}
          >
            <div className="flex flex-col gap-0.5">
              <span
                className="font-sans text-[11px] uppercase tracking-wide transition-colors"
                style={{ color: isHovered ? "#f59e0b" : "#555" }}
              >
                {city.abbr}
              </span>
              <span
                className="font-sans text-[10px] uppercase tracking-wide transition-colors"
                style={{ color: isHovered ? "#f59e0b" : "#444" }}
              >
                {getETOffset(city.timezone)}
              </span>
            </div>
            <span
              className="font-mono text-base transition-colors"
              style={{ color: isHovered ? "#f59e0b" : "#9ca3af" }}
              suppressHydrationWarning
            >
              {times[city.id] ?? "--:--:--"}
            </span>
          </div>
        );
      })}
    </div>
  );
}
