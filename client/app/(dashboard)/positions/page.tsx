import PositionsTab from "@/app/components/PositionsTab";
import { createSupabaseServerClient } from "../../lib/supabase-server";
import { RtmSession } from "../../types";

export default async function PositionsPage() {
  const supabase = await createSupabaseServerClient();

  const today = new Date().toLocaleDateString("en-CA", {
    timeZone: "America/New_York",
  });

  const { data: smlSession } = await supabase
    .from("rtm_sessions")
    .select("*")
    .gte("created_at", `${today}T00:00:00`)
    .lt("created_at", `${today}T23:59:59`)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return (
    <PositionsTab
      initialSmlSession={(smlSession ?? null) as RtmSession | null}
    />
  );
}
