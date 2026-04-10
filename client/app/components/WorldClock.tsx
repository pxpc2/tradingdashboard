"use client";

import { useState, useEffect } from "react";

type City = {
  id: string;
  label: string;
  timezone: string;
};

const CITIES: City[] = [
  { id: "chi", label: "Chicago", timezone: "America/Chicago" },
  { id: "nyc", label: "New York", timezone: "America/New_York" },
  { id: "brt", label: "Brasília", timezone: "America/Sao_Paulo" },
  { id: "ldn", label: "London", timezone: "Europe/London" },
];

function getTime(timezone: string): string {
  return new Date().toLocaleTimeString("en-US", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
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
              border: isHovered ? "1px solid rgba(245, 158, 11, 0.3)" : "1px solid transparent",
            }}
            onMouseEnter={() => setHovered(city.id)}
            onMouseLeave={() => setHovered(null)}
          >
            <span
              className="font-sans text-[11px] uppercase tracking-wide transition-colors"
              style={{ color: isHovered ? "#f59e0b" : "#555" }}
            >
              {city.label}
            </span>
            <span
              className="font-mono text-base transition-colors"
              style={{ color: isHovered ? "#f59e0b" : "#9ca3af" }}
              suppressHydrationWarning
            >
              {times[city.id] ?? "--:--"}
            </span>
          </div>
        );
      })}
    </div>
  );
}
