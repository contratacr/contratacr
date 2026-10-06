import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Los perfiles que esta cuenta bloqueó: su contenido no se le muestra en
 * ningún lado (búsqueda, tableros, fichas). Sin sesión, nada que ocultar.
 * Si la tabla aún no existe en esta base, no se oculta nada: un bloqueo nunca
 * puede tumbar una pantalla.
 */
export async function perfilesBloqueadosPor(userId: string | null | undefined): Promise<Set<string>> {
  if (!userId) return new Set();
  try {
    const { data, error } = await createAdminClient().from("user_blocks").select("blocked_id").eq("blocker_id", userId);
    if (error) return new Set();
    return new Set((data ?? []).map((f) => String((f as { blocked_id: string }).blocked_id)));
  } catch {
    return new Set();
  }
}

/** De estos profesionales, los que esta cuenta bloqueó (por su id de profesional). */
export async function profesionalesQueBloqueo(userId: string | null | undefined, professionalIds: string[]): Promise<Set<string>> {
  const perfiles = await perfilesBloqueadosPor(userId);
  const ids = [...new Set(professionalIds.filter(Boolean))];
  if (perfiles.size === 0 || ids.length === 0) return new Set();
  try {
    const { data } = await createAdminClient().from("professionals").select("id, profile_id").in("id", ids);
    return new Set((data ?? []).filter((f) => perfiles.has(String((f as { profile_id: string }).profile_id))).map((f) => String((f as { id: string }).id)));
  } catch {
    return new Set();
  }
}
