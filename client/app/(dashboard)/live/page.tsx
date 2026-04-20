import { createSupabaseServerClient } from "../../lib/supabase-server";

export default async function LivePage() {
  // Auth guard redundant with layout but keeps SSR shape consistent.
  // Data fetching lands here in Chunk 2.
  await createSupabaseServerClient();

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="text-center text-text-5 text-xs uppercase tracking-[0.1em] py-16">
        LIVE tab — scaffolding in place, content coming in Chunk 2
      </div>
    </div>
  );
}
