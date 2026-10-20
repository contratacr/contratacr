import type { PostgrestError } from "@supabase/supabase-js";

type PageResult<T> = { data: T[] | null; error: PostgrestError | null };

// Administrative queues must not filter a truncated first page. Callers supply
// a stable order (including the unique id) and the inclusive PostgREST range.
export async function readAllAdminRows<T>(
  readPage: (from: number, to: number) => PromiseLike<PageResult<T>>,
): Promise<PageResult<T>> {
  const pageSize = 500;
  const rows: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const result = await readPage(from, from + pageSize - 1);
    if (result.error) return { data: null, error: result.error };
    const page = result.data ?? [];
    rows.push(...page);
    if (page.length < pageSize) return { data: rows, error: null };
  }
}
