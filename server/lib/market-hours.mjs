export function getTodayET() {
  return new Date().toLocaleDateString("en-CA", {
    timeZone: "America/New_York",
  });
}

export function nowCT() {
  return new Date().toLocaleString("en-US", {
    timeZone: "America/Chicago",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

export function getETTime() {
  return new Date().toLocaleTimeString("en-US", {
    timeZone: "America/New_York",
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function getETDay() {
  return new Date().toLocaleDateString("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
  });
}

export function isMarketHours() {
  const day = getETDay();
  const time = getETTime();
  if (["Sat", "Sun"].includes(day)) return false;
  return time >= "09:30:00" && time < "16:00:00";
}

export function isGlobexHours() {
  const day = getETDay();
  const time = getETTime();
  if (day === "Sat") return false;
  if (day === "Sun" && time < "18:00:00") return false;
  if (!["Sat", "Sun"].includes(day) && time >= "17:00:00" && time < "18:00:00")
    return false;
  return true;
}

// Returns ms until the next clean minute boundary
export function msUntilNextMinute() {
  const now = Date.now();
  const nextMinute = Math.ceil(now / 60000) * 60000;
  return nextMinute - now;
}

// Returns the current minute boundary as a UTC timestamptz string
export function currentBarTime() {
  const barMs = Math.floor(Date.now() / 60000) * 60000;
  return new Date(barMs).toISOString();
}
