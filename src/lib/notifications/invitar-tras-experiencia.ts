import type { createAdminClient } from "@/lib/supabase/admin";
import { invitarAResenaDeGoogle } from "@/lib/notifications/invitacion-resena-google";

type Admin = ReturnType<typeof createAdminClient>;

/**
 * LA RESEÑA EN GOOGLE SE PIDE DESPUÉS DE USAR LA APP, no al registrarse
 * (3-oct-2026). Pedirla a una cuenta recién creada es pedir opinión de algo
 * que la persona todavía no probó. Una vez al día se invita a quien:
 *  - lleva al menos 3 días con la cuenta, y
 *  - ya tuvo una experiencia real: publicó un proyecto, escribió por el chat,
 *    dejó una reseña a un profesional o, si es profesional, recibió una.
 * Cada cuenta recibe la invitación una sola vez (lo garantiza invitarAResenaDeGoogle).
 */
const DIAS_MINIMOS = 3;
const VENTANA_DIAS = 60;

export async function invitarTrasExperiencia(admin: Admin, { simular = false } = {}) {
  const desde = new Date(Date.now() - VENTANA_DIAS * 86_400_000).toISOString();
  const ids = new Set<string>();
  const sumar = (filas: Record<string, unknown>[] | null, campo: string) => (filas ?? []).forEach((f) => { const v = f[campo]; if (typeof v === "string" && v) ids.add(v); });

  const [proyectos, mensajes, escritas, recibidas] = await Promise.all([
    admin.from("projects").select("client_id").gte("created_at", desde).limit(2000),
    admin.from("direct_messages").select("sender_id").gte("created_at", desde).limit(5000),
    admin.from("reviews").select("client_id").gte("created_at", desde).limit(2000),
    admin.from("reviews").select("professional_id").gte("created_at", desde).limit(2000),
  ]);
  sumar(proyectos.data as Record<string, unknown>[] | null, "client_id");
  sumar(mensajes.data as Record<string, unknown>[] | null, "sender_id");
  sumar(escritas.data as Record<string, unknown>[] | null, "client_id");
  // La reseña recibida apunta a la ficha del profesional: se pasa a su cuenta.
  const fichas = [...new Set(((recibidas.data ?? []) as { professional_id?: string | null }[]).map((r) => r.professional_id).filter(Boolean))] as string[];
  if (fichas.length) {
    const { data } = await admin.from("professionals").select("profile_id").in("id", fichas);
    sumar(data as Record<string, unknown>[] | null, "profile_id");
  }
  if (ids.size === 0) return { candidatos: 0, enviadas: 0, yaTenian: 0 };

  // Solo cuentas con al menos 3 días.
  const limite = new Date(Date.now() - DIAS_MINIMOS * 86_400_000).toISOString();
  const lista = [...ids];
  const conAntiguedad: string[] = [];
  for (let i = 0; i < lista.length; i += 200) {
    const { data } = await admin.from("profiles").select("id").in("id", lista.slice(i, i + 200)).lte("created_at", limite);
    (data ?? []).forEach((f) => conAntiguedad.push(String((f as { id: string }).id)));
  }
  if (simular) return { candidatos: conAntiguedad.length, enviadas: 0, yaTenian: 0 };
  const resultado = await invitarAResenaDeGoogle(admin, conAntiguedad);
  return { candidatos: conAntiguedad.length, ...resultado };
}
