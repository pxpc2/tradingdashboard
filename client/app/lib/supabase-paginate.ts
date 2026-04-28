type Page<T> = { data: T[] | null; error: unknown };
type PageBuilder<T> = (from: number, to: number) => PromiseLike<Page<T>>;

// Page through a Supabase query in chunks to bypass the project max-rows
// cap (15000). The builder receives `from` / `to` indices to plug into
// `.range()`; do NOT pre-apply `.range()` on the query you build.
//
// Example:
//   const rows = await fetchAll<SkewSnapshot>((from, to) =>
//     supabase
//       .from("skew_snapshots")
//       .select("*")
//       .gte("created_at", "2026-04-02")
//       .order("created_at", { ascending: true })
//       .range(from, to)
//   );
export async function fetchAll<T>(
  buildPage: PageBuilder<T>,
  pageSize = 1000,
): Promise<T[]> {
  const all: T[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await buildPage(from, from + pageSize - 1);
    if (error) {
      console.error("[fetchAll] page error, returning partial:", error);
      break;
    }
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return all;
}
