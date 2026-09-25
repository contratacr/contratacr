import type { createAdminClient } from "@/lib/supabase/admin";

/**
 * LA INVITACIÓN A DEJAR UNA RESEÑA EN GOOGLE, dentro del app.
 *
 * No va por correo: gastaría del cupo diario de 300 que ya limita las
 * campañas. Y no se pide justo después de que alguien reseña a un
 * profesional —acaba de hacernos un favor, pedirle otro ahí es evasivo—.
 * Un aviso en la campanita no cuesta nada y espera a que la persona entre.
 *
 * Una sola vez por cuenta: antes de insertar se comprueba que no exista ya.
 */
type Admin = ReturnType<typeof createAdminClient>;

const TITULO = { es: "¿Nos dejas una reseña?", en: "Would you leave us a review?" };
const CUERPO = {
  es: "Una reseña en Google ayuda a que más personas encuentren ContrataCR. Tarda menos de un minuto.",
  en: "A Google review helps more people find ContrataCR. It takes less than a minute.",
};

export async function invitarAResenaDeGoogle(admin: Admin, profileIds: string[], idioma: "es" | "en" = "es") {
  const destinatarios = [...new Set(profileIds.filter(Boolean))];
  if (destinatarios.length === 0) return { enviadas: 0, yaTenian: 0 };
  try {
    const { data: previas } = await admin
      .from("notifications")
      .select("user_id")
      .eq("type", "resena_google")
      .in("user_id", destinatarios);
    const yaTienen = new Set((previas ?? []).map((f) => String((f as { user_id: string }).user_id)));
    const nuevos = destinatarios.filter((id) => !yaTienen.has(id));
    if (nuevos.length === 0) return { enviadas: 0, yaTenian: yaTienen.size };
    // En tandas: una sola sentencia con miles de filas se cae por tamaño.
    let enviadas = 0;
    for (let i = 0; i < nuevos.length; i += 200) {
      const tanda = nuevos.slice(i, i + 200).map((userId) => ({
        user_id: userId,
        type: "resena_google",
        title: TITULO[idioma],
        message: CUERPO[idioma],
        data: { link: "/resena-google" },
        read: false,
      }));
      const { error } = await admin.from("notifications").insert(tanda);
      if (!error) enviadas += tanda.length;
    }
    return { enviadas, yaTenian: yaTienen.size };
  } catch {
    // Un aviso nunca puede tumbar el registro ni nada de lo que lo llame.
    return { enviadas: 0, yaTenian: 0 };
  }
}
