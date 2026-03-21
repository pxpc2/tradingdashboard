import { supabase } from "./lib/supabase";

export default async function Home() {
  const { data, error } = await supabase
    .from("straddle_snapshots")
    .select("*")
    .order("created_at", { ascending: true })
    .limit(5);

  console.log("data:", data);
  console.log("error:", error);

  return (
    <div className="bg-black h-screen w-full">
      <main>
        <h1 className="text-white text-center py-4">vovonacci dashboard</h1>
        <pre className="text-gray-500">{JSON.stringify(data, null, 2)}</pre>
      </main>
    </div>
  );
}
