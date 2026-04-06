"use client";

import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

export type PharmLevel = {
  high: number;
  low: number | null; // null = single level
  label: string;
  isKey: boolean;
  source: "weekly" | "daily";
};

function parseContent(
  content: string,
  source: "weekly" | "daily",
): PharmLevel[] {
  if (!content?.trim()) return [];
  const lines = content
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const levels: PharmLevel[] = [];

  for (const line of lines) {
    // Check for asterisk
    const isKey = line.includes("*");

    // Match number or number-number at start
    const match = line.match(/^([\d.]+)(?:-([\d.]+))?/);
    if (!match) continue;

    const val1 = parseFloat(match[1]);
    const val2 = match[2] ? parseFloat(match[2]) : null;

    const high = val2 !== null ? Math.max(val1, val2) : val1;
    const low = val2 !== null ? Math.min(val1, val2) : null;

    // Label = notes after numbers, strip asterisks
    const label = line
      .replace(/^[\d.]+(?:-[\d.]+)?/, "")
      .replace(/\*/g, "")
      .trim();

    levels.push({ high, low, label, isKey, source });
  }

  return levels;
}

export function usePharmLevels() {
  const [weeklyLevels, setWeeklyLevels] = useState<PharmLevel[]>([]);
  const [dailyLevels, setDailyLevels] = useState<PharmLevel[]>([]);

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("pharm_levels")
        .select("weekly_content, daily_content")
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (data) {
        setWeeklyLevels(parseContent(data.weekly_content ?? "", "weekly"));
        setDailyLevels(parseContent(data.daily_content ?? "", "daily"));
      }
    }
    load();
  }, []);

  return { weeklyLevels, dailyLevels };
}
