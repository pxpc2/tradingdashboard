import { createSupabaseServerClient } from "../../lib/supabase-server";
import AnalysisDashboard from "./AnalysisDashboard";

export default async function AnalysisPage() {
  const supabase = await createSupabaseServerClient();

  const { data: straddleSnapshots } = await supabase
    .from("straddle_snapshots")
    .select("created_at, spx_ref, atm_strike, straddle_mid, es_basis")
    .order("created_at", { ascending: true });

  const { data: skewSnapshots } = await supabase
    .from("skew_snapshots")
    .select("created_at, skew, put_iv, call_iv, atm_iv")
    .gte("created_at", "2026-04-02T00:00:00")
    .order("created_at", { ascending: true });

  const { data: esSnapshots } = await supabase
    .from("es_snapshots")
    .select("created_at, open, high, low, es_ref")
    .order("created_at", { ascending: true });

  const { data: weeklyStraddles } = await supabase
    .from("weekly_straddle_snapshots")
    .select("*")
    .order("created_at", { ascending: false });

  const { data: latestStraddle } = await supabase
    .from("straddle_snapshots")
    .select("spx_ref")
    .order("created_at", { ascending: false })
    .limit(1);

  const { data: sessionSummaries } = await supabase
    .from("session_summary")
    .select(
      "date, opening_vix, opening_vix1d, opening_vix1d_vix_ratio, has_high_impact_macro, spx_closed_above_open",
    )
    .order("date", { ascending: true });

  const currentSpx = latestStraddle?.[0]?.spx_ref ?? null;

  return (
    <AnalysisDashboard
      straddleSnapshots={straddleSnapshots ?? []}
      skewSnapshots={skewSnapshots ?? []}
      esSnapshots={esSnapshots ?? []}
      weeklyStraddles={weeklyStraddles ?? []}
      currentSpx={currentSpx}
      sessionSummaries={
        (sessionSummaries ?? []) as {
          date: string;
          opening_vix: number | null;
          opening_vix1d: number | null;
          opening_vix1d_vix_ratio: number | null;
          has_high_impact_macro: boolean | null;
          spx_closed_above_open: boolean | null;
        }[]
      }
    />
  );
}
