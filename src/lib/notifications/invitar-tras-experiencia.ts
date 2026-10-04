import type { createAdminClient } from "@/lib/supabase/admin";
import { invitarAResenaDeGoogle } from "@/lib/notifications/invitacion-resena-google";

type Admin = ReturnType<typeof createAdminClient>;

/**
 * LA RESEÑA EN GOOGLE SE PIDE DESPUÉS DE USAR LA APP, no al registrarse.
 * Una vez al día se invita a toda cuenta que hizo CUALQUIER interacción real
 * (decisión de Isaac, 3-oct-2026):
 *  - publicó un proyecto, un empleo o una promoción;
 *  - contactó a un profesional (WhatsApp, llamada) o escribió por el chat;
 *  - hizo una cotización;
 *  - dejó una reseña o, si es profesional, recibió una.
 * La interacción tiene que tener al menos un día: se pide opinión cuando ya
 * hubo tiempo de ver cómo le fue, no en el mismo momento. Cada cuenta recibe la
 * invitación una sola vez (lo garantiza invitarAResenaDeGoogle).
 */
const VENTANA_DIAS = 60;
const ESPERA_HORAS = 24;

type Filas = Record<string, unknown>[] | null;

export async function invitarTrasExperiencia(admin: Admin, { simular = false } = {}) {
  const desde = new Date(Date.now() - VENTANA_DIAS * 86_400_000).toISOString();
  const hasta = new Date(Date.now() - ESPERA_HORAS * 3_600_000).toISOString();
  const cuentas = new Set<string>();
  const fichas = new Set<string>();
  const sumar = (destino: Set<string>, filas: Filas, campo: string) => (filas ?? []).forEach((f) => { const v = f[campo]; if (typeof v === "string" && v) destino.add(v); });
  const en = (tabla: string, campos: string) => admin.from(tabla).select(campos).gte("created_at", desde).lte("created_at", hasta).limit(5000);

  const [proyectos, mensajes, escritas, recibidas, empleos, promociones, cotizaciones, whatsapp, interacciones] = await Promise.all([
    en("projects", "client_id"),
    en("direct_messages", "sender_id"),
    en("reviews", "client_id"),
    en("reviews", "professional_id"),
    en("job_posts", "employer_id"),
    en("professional_offers", "professional_id"),
    en("quotes", "professional_id"),
    en("whatsapp_contact_followups", "client_id"),
    // Contactos registrados por la analítica (WhatsApp, llamada, etc.) de quien tenía sesión.
    en("interaction_events", "viewer_user_id, event_type").not("viewer_user_id", "is", null),
  ]);
  // Lo que apunta a la CUENTA.
  sumar(cuentas, proyectos.data as Filas, "client_id");
  sumar(cuentas, mensajes.data as Filas, "sender_id");
  sumar(cuentas, escritas.data as Filas, "client_id");
  sumar(cuentas, whatsapp.data as Filas, "client_id");
  const contactos = ((interacciones.data ?? []) as { viewer_user_id?: string | null; event_type?: string | null }[])
    .filter((f) => /contact|whatsapp|call|llamad|lead/i.test(f.event_type ?? ""));
  sumar(cuentas, contactos as Filas, "viewer_user_id");
  // Lo que apunta a la FICHA del profesional: se pasa a su cuenta.
  sumar(fichas, recibidas.data as Filas, "professional_id");
  sumar(fichas, empleos.data as Filas, "employer_id");
  sumar(fichas, promociones.data as Filas, "professional_id");
  sumar(fichas, cotizaciones.data as Filas, "professional_id");
  const listaFichas = [...fichas];
  for (let i = 0; i < listaFichas.length; i += 200) {
    const { data } = await admin.from("professionals").select("profile_id").in("id", listaFichas.slice(i, i + 200));
    sumar(cuentas, data as Filas, "profile_id");
  }

  const lista = [...cuentas];
  if (simular) return { candidatos: lista.length, enviadas: 0, yaTenian: 0 };
  if (lista.length === 0) return { candidatos: 0, enviadas: 0, yaTenian: 0 };
  const resultado = await invitarAResenaDeGoogle(admin, lista);
  return { candidatos: lista.length, ...resultado };
}
