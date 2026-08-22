import { ensureServerCategoryCatalog } from "@/lib/data/server-category-catalog";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { assertSafeSupabaseRuntime } from "@/lib/security/supabase-target";

export function hasSupabaseServerConfig() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

export async function createClient() {
  // Pages and layouts render concurrently; whoever asks for a client first
  // makes sure the service catalogue (renames, groups) is loaded for labels.
  await ensureServerCategoryCatalog();
  assertSafeSupabaseRuntime("Supabase server");

  if (!hasSupabaseServerConfig()) {
    throw new Error("Supabase server env vars are not configured.");
  }
  // Pages and layouts render concurrently; whoever asks for a client first
  // makes sure the service catalogue (renames, groups) is loaded for labels.
  await ensureServerCategoryCatalog();

  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // Called from Server Component — cookie writes are ignored
          }
        },
      },
    }
  );
}
