import type { createAdminClient } from "@/lib/supabase/admin";

/** Resolve account labels by ID, never by a possibly shared or outdated email.
 * No persistent cache: admin corrections must be visible on the next read.
 */
export async function getCurrentProfileNames(
  db: ReturnType<typeof createAdminClient>, ids: (string | null | undefined)[],
): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((id): id is string => !!id))];
  const batches: string[][] = [];
  for (let i = 0; i < unique.length; i += 100) batches.push(unique.slice(i, i + 100));
  const results = await Promise.all(batches.map((batch) => db.from("profiles").select("id, full_name").in("id", batch)));
  const names = new Map<string, string>();
  for (const { data, error } of results) {
    if (error) throw new Error("No se pudieron cargar los nombres actuales de las cuentas.");
    for (const row of data ?? []) if (row.full_name?.trim()) names.set(row.id, row.full_name);
  }
  return names;
}
