import { supabase } from "./lib/supabase";
import LiveDashboard from "./components/LiveDashboard";

export default async function Home() {
  const today = new Date().toLocaleDateString("en-CA", {
    timeZone: "America/New_York",
  });

  const { data: straddleSnapshots } = await supabase
    .from("straddle_snapshots")
    .select("*")
    .gte("created_at", `${today}T00:00:00`)
    .order("created_at", { ascending: true });

  const { data: sessions } = await supabase
    .from("rtm_sessions")
    .select("*")
    .gte("created_at", `${today}T00:00:00`)
    .order("created_at", { ascending: false })
    .limit(1);

  const todaySession = sessions?.[0] ?? null;

  return (
    <main className="min-h-screen bg-[#0a0a0a] text-white">
      <LiveDashboard
        initialStraddleData={straddleSnapshots ?? []}
        initialSmlSession={todaySession}
      />
    </main>
  );
}
