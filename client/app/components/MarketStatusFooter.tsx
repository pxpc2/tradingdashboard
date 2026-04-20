"use client";

import { useEffect, useState } from "react";

type VenueStatus = {
  code: string;
  isOpen: (d: Date) => boolean;
};

function nyTime(d: Date): string {
  return d.toLocaleTimeString("en-GB", {
    timeZone: "America/New_York",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function nyDay(d: Date): string {
  return d.toLocaleDateString("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
  });
}

// NYSE + CBOE equity options = 09:30–16:00 ET Mon–Fri
function isRegularOpen(d: Date): boolean {
  const day = nyDay(d);
  if (day === "Sat" || day === "Sun") return false;
  const t = nyTime(d);
  return t >= "09:30:00" && t < "16:00:00";
}

// Globex (ES, etc.) — 18:00 ET Sun through 17:00 ET Fri with daily 17:00–18:00 halt
function isGlobexOpen(d: Date): boolean {
  const day = nyDay(d);
  const t = nyTime(d);
  if (day === "Sat") return false;
  if (day === "Sun" && t < "18:00:00") return false;
  if (day === "Fri" && t >= "17:00:00") return false;
  if (!["Sat", "Sun"].includes(day) && t >= "17:00:00" && t < "18:00:00")
    return false;
  return true;
}

const VENUES: VenueStatus[] = [
  { code: "NYSE", isOpen: isRegularOpen },
  { code: "CBOE", isOpen: isRegularOpen },
  { code: "GLBX", isOpen: isGlobexOpen },
];

export default function MarketStatusFooter() {
  const [now, setNow] = useState<Date>(new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 5000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="bg-panel border-t border-border">
      <div className="max-w-7xl mx-auto px-4 h-6 flex items-center gap-3 text-[10px]">
        {VENUES.map((v) => {
          const open = v.isOpen(now);
          return (
            <div key={v.code} className="flex items-center gap-1">
              <span className="font-sans text-text-4 uppercase tracking-wide">
                {v.code}
              </span>
              <span
                className={open ? "text-up" : "text-text-6"}
                aria-label={open ? "open" : "closed"}
              >
                ●
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
