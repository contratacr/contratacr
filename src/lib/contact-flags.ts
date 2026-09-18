import { createAdminClient } from "@/lib/supabase/admin";

export type ContactFlags = {
  hasWhatsapp: boolean;
  allowPhoneCall: boolean;
};

/**
 * Banderas de contacto de un profesional: SI tiene WhatsApp y SI acepta
 * llamadas. Nunca el número.
 *
 * Se lee con el cliente de servicio a propósito: así la respuesta es la misma
 * para un invitado que para alguien con cuenta, sin depender de qué columnas
 * puede leer cada uno. Y el dato no baja a la página: el número se pide al
 * tocar el botón, por /api/contact/reveal, que lleva tope por hora.
 *
 * El correo no está en la lista. En dos meses hubo 86 toques a WhatsApp, 4 a
 * «Llamar» y CERO al correo, con 92 profesionales que tienen uno puesto.
 */
export async function contactFlagsFor(professionalIds: string[]): Promise<Record<string, ContactFlags>> {
  const ids = [...new Set(professionalIds.filter(Boolean))];
  if (ids.length === 0) return {};
  const db = createAdminClient();
  const { data, error } = await db
    .from("professionals")
    .select("id, whatsapp, call_phone, allow_phone_call, is_banned")
    .in("id", ids);
  if (error) {
    console.error("Could not load contact flags", error.message);
    return {};
  }
  const mapa: Record<string, ContactFlags> = {};
    // Un perfil bloqueado está fuera de la búsqueda Y fuera de alcance: sin
  // banderas no se dibuja ningún botón, igual que hace /api/contact/reveal.
  for (const fila of (data ?? []) as Array<{ id: string; whatsapp?: string | null; call_phone?: string | null; allow_phone_call?: boolean | null; is_banned?: boolean | null }>) {
    if (fila.is_banned) continue;
    const telefono = ((fila.call_phone || fila.whatsapp) ?? "").trim();
    mapa[fila.id] = {
      hasWhatsapp: !!(fila.whatsapp ?? "").trim(),
      allowPhoneCall: !!fila.allow_phone_call && !!telefono,
    };
  }
  return mapa;
}

/**
 * Los profesionales bloqueados de una lista. Sus publicaciones (promociones,
 * empleos) NO salen en los tableros: el perfil ya está fuera de la búsqueda y
 * sin botones de contacto, así que su promoción se veía en la lista y abría
 * una ficha sin ninguna forma de escribirle —un callejón sin salida—.
 *
 * Si la consulta falla, no se bloquea a nadie: preferimos mostrar una
 * publicación de más que vaciar un tablero por un error de red.
 */
export async function profesionalesBloqueados(professionalIds: string[]): Promise<Set<string>> {
  const ids = [...new Set(professionalIds.filter(Boolean))];
  if (ids.length === 0) return new Set();
  const { data, error } = await createAdminClient()
    .from("professionals")
    .select("id")
    .in("id", ids)
    .eq("is_banned", true);
  if (error) {
    console.error("Could not load banned professionals", error.message);
    return new Set();
  }
  return new Set(((data ?? []) as Array<{ id: string }>).map((fila) => fila.id));
}
