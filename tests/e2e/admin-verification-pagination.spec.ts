import { PostgrestError } from "@supabase/supabase-js";
import { test, expect } from "playwright/test";
import { readAllAdminRows, readAdminRowsByIds } from "../../src/lib/admin/read-all-rows";

test("verification reads include older pending accounts beyond the first database page", async () => {
  const source = Array.from({ length: 1203 }, (_, id) => ({ id, pending: id < 8 || (id >= 1100 && id < 1110) }));
  const result = await readAllAdminRows(async (from, to) => ({ data: source.slice(from, to + 1), error: null }));
  expect(result.error).toBeNull();
  expect(result.data).toHaveLength(1203);
  expect(new Set(result.data!.map(row => row.id)).size).toBe(1203);
  expect(result.data!.filter(row => row.pending)).toHaveLength(18);
  expect(result.data!.at(-1)?.id).toBe(1202);
});

test("verification returns an empty queue when no accounts match", async () => {
  expect(await readAllAdminRows(async () => ({ data: [], error: null }))).toEqual({ data: [], error: null });
});

test("a later database failure must not masquerade as a smaller verification queue", async () => {
  const error = new PostgrestError({ code: "57014", message: "Query canceled", details: "", hint: "" });
  const result = await readAllAdminRows(async (from) => from === 0
    ? { data: Array.from({ length: 500 }, (_, id) => ({ id })), error: null }
    : { data: null, error });
  expect(result).toEqual({ data: null, error });
});


test("large enrichment filters are batched and do not lose records or repeat ids", async () => {
  const ids = Array.from({ length: 1203 }, (_, i) => String(i));
  const result = await readAdminRowsByIds([...ids, ids[0]], async (batch) => {
    expect(batch.length).toBeLessThanOrEqual(100);
    return { data: batch.map(id => ({ id })), error: null };
  });
  expect(result.data?.map(row => row.id)).toEqual(ids);
});
