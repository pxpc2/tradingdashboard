import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "../lib/supabase-server";
import TradingPlanDashboard from "./TradingPlanDashboard";

function classifyOvernightRange(pts: number): "tight" | "normal" | "wide" {
  if (pts < 50) return "tight";
  if (pts <= 100) return "normal";
  return "wide";
}

export default async function TradingPlanPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const today = new Date().toLocaleDateString("en-CA", {
    timeZone: "America/New_York",
  });

  const { data: plans } = await supabase
    .from("trading_plans")
    .select("*")
    .order("date", { ascending: false });

  const { data: skewRows } = await supabase
    .from("skew_snapshots")
    .select("skew, put_iv, call_iv, atm_iv, created_at")
    .gte("created_at", `${today}T00:00:00`)
    .order("created_at", { ascending: false })
    .limit(1);

  const { data: allSkew } = await supabase
    .from("skew_snapshots")
    .select("skew")
    .gte("created_at", "2026-04-02T00:00:00");

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const sevenDaysAgoStr = sevenDaysAgo.toISOString().slice(0, 10);

  const { data: recentSkewRows } = await supabase
    .from("skew_snapshots")
    .select("skew, atm_iv, created_at")
    .gte("created_at", `${sevenDaysAgoStr}T00:00:00`)
    .order("created_at", { ascending: true });

  const { data: straddleRows } = await supabase
    .from("straddle_snapshots")
    .select("straddle_mid, spx_ref, atm_strike, created_at")
    .gte("created_at", `${today}T00:00:00`)
    .order("created_at", { ascending: false })
    .limit(1);

  const { data: weeklyRows } = await supabase
    .from("weekly_straddle_snapshots")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(1);

  // Overnight ES range — yesterday 21:00 UTC → today 13:30 UTC
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().slice(0, 10);
  const windowStart = `${yesterdayStr}T21:00:00Z`;
  const windowEnd = `${today}T13:30:00Z`;

  const { data: esSnapshots } = await supabase
    .from("es_snapshots")
    .select("high, low, created_at")
    .gte("created_at", windowStart)
    .lt("created_at", windowEnd)
    .order("created_at", { ascending: true });

  let overnightRangePts: number | null = null;
  let overnightRangeClass: "tight" | "normal" | "wide" | null = null;

  const validBars = (esSnapshots ?? []).filter(
    (e) => e.high !== null && e.low !== null && e.high > 0 && e.low > 0,
  );

  if (validBars.length >= 5) {
    const high = Math.max(...validBars.map((e) => e.high));
    const low = Math.min(...validBars.map((e) => e.low));
    overnightRangePts = parseFloat((high - low).toFixed(2));
    overnightRangeClass = classifyOvernightRange(overnightRangePts);
  }

  const latestSkew = skewRows?.[0] ?? null;
  const latestStraddle = straddleRows?.[0] ?? null;
  const weeklyStraddle = weeklyRows?.[0] ?? null;
  const allSkewValues = (allSkew ?? []).map((s: { skew: number }) => s.skew);

  const skewPctile =
    latestSkew && allSkewValues.length > 0
      ? Math.round(
          (allSkewValues.filter((v: number) => v <= latestSkew.skew).length /
            allSkewValues.length) *
            100,
        )
      : null;

  return (
    <main className="min-h-screen bg-[#0a0a0a] text-white">
      <TradingPlanDashboard
        today={today}
        plans={plans ?? []}
        latestSkew={latestSkew}
        skewPctile={skewPctile}
        latestStraddle={latestStraddle}
        weeklyStraddle={weeklyStraddle}
        recentSkewRows={
          (recentSkewRows ?? []) as {
            skew: number;
            atm_iv: number;
            created_at: string;
          }[]
        }
        overnightRangePts={overnightRangePts}
        overnightRangeClass={overnightRangeClass}
      />
    </main>
  );
}
