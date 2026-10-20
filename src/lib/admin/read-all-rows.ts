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

// Keep IN filters below URL limits as well as paging their result sets.
export async function readAdminRowsByIds<T>(
  ids: string[],
  readPage: (ids: string[], from: number, to: number) => PromiseLike<PageResult<T>>,
): Promise<PageResult<T>> {
  const unique = [...new Set(ids)];
  const rows: T[] = [];
  for (let i = 0; i < unique.length; i += 100) {
    const batch = unique.slice(i, i + 100);
    const result = await readAllAdminRows((from, to) => readPage(batch, from, to));
    if (result.error) return result;
    rows.push(...(result.data ?? []));
  }
  return { data: rows, error: null };
}
