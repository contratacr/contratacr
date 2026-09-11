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

/**
 * Cliente público SIN cookies, para lecturas que se guardan en caché.
 *
 * `unstable_cache` prohíbe tocar cookies dentro de la función guardada: si el
 * cliente las lee, Next lanza «Accessing Dynamic data sources inside a cache
 * scope is not supported» y la ficha del profesional desaparece entera. Este
 * cliente entra como visitante anónimo, que es exactamente lo que se guarda en
 * la caché pública; lo que depende de quién mira se consulta aparte.
 */
export async function createPublicClient() {
  await ensureServerCategoryCatalog();
  assertSafeSupabaseRuntime("Supabase público");

  if (!hasSupabaseServerConfig()) {
    throw new Error("Supabase server env vars are not configured.");
  }

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return [];
        },
        setAll() {
          // Sin sesión: no hay nada que escribir.
        },
      },
    }
  );
}
