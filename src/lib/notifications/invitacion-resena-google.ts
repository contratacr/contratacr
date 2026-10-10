import { insertOnceNotifications, onceReceipts } from "@/lib/notifications/once";
import type { createAdminClient } from "@/lib/supabase/admin";

/**
 * LA INVITACIÓN A DEJAR UNA RESEÑA EN GOOGLE, dentro del app.
 *
 * No va por correo: gastaría del cupo diario de 300 que ya limita las
 * campañas. Y no se pide justo después de que alguien reseña a un
 * profesional —acaba de hacernos un favor, pedirle otro ahí es evasivo—.
 * Un aviso en la campanita no cuesta nada y espera a que la persona entre.
 *
 * Una sola vez por cuenta: el recibo permanente y el disparador de la base evitan repeticiones.
 */
type Admin = ReturnType<typeof createAdminClient>;

const TITULO = { es: "¿Nos dejas una reseña?", en: "Would you leave us a review?" };
const CUERPO = {
  es: "Una reseña en Google ayuda a que más personas encuentren ContrataCR. Tarda menos de un minuto.",
  en: "A Google review helps more people find ContrataCR. It takes less than a minute.",
};

export async function invitarAResenaDeGoogle(admin: Admin, profileIds: string[], idioma: "es" | "en" = "es") {
  const destinatarios = [...new Set(profileIds.filter(Boolean))];
  const recibos = await onceReceipts(admin, destinatarios, ["resena_google"]);
  const bloqueados = new Set(recibos.map((r) => r.user_id));
  const nuevos = destinatarios.filter((id) => !bloqueados.has(id));
  const enviadas = await insertOnceNotifications(admin, nuevos.map((userId) => ({
    user_id: userId,
    type: "resena_google",
    title: TITULO[idioma],
    message: CUERPO[idioma],
    data: { link: "/resena-google" },
    read: false,
  })));
  return {
    enviadas,
    yaTenian: recibos.filter((r) => r.status === "sent").length,
    historialSinConfirmar: recibos.filter((r) => r.status === "historical_unknown").length,
  };
}
